import { auth, db } from '@/lib/firebase/config';
import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  ActionCodeSettings,
  GoogleAuthProvider,
  signInWithPopup,
  fetchSignInMethodsForEmail
} from 'firebase/auth';
import { createUser } from './firebase/user-service';
import { createArtisan } from './firebase/artisan-service';
import { syncEmailVerificationStatus } from './firebase/email-verification-sync';
import type { User as UserType, Artisan } from '@/types/firestore';
import { Timestamp, doc, updateDoc } from 'firebase/firestore';

/**
 * 🔒 SÉCURITÉ : Liste des emails administrateurs
 * Ces emails NE PEUVENT PAS se connecter via Google Sign-In
 * Les admins doivent OBLIGATOIREMENT utiliser l'interface dédiée /access-x7k9m2p4w8n3
 */
const ADMIN_EMAILS_BLACKLIST = [
  'admin@artisansafe.fr',
  'admin@artisandispo.fr',
  'support@artisansafe.fr',
  'root@artisansafe.fr',
  // Ajoutez ici tous les emails d'administrateurs
];

/**
 * 🔐 SÉCURITÉ RENFORCÉE : Whitelist des emails administrateurs autorisés
 * SEULS ces emails peuvent se connecter via l'interface admin /access-x7k9m2p4w8n3
 * Tout autre email sera refusé MÊME s'il a le rôle 'admin' dans Firestore
 */
const ADMIN_EMAILS_WHITELIST = [
  'admin@artisansafe.fr',
  'admin@artisandispo.fr',
  'support@artisansafe.fr',
  'root@artisansafe.fr',
  // Ajoutez ici UNIQUEMENT les emails administrateurs de confiance
];

/**
 * Vérifier si un email fait partie de la liste des administrateurs
 */
function isAdminEmail(email: string | null): boolean {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase().trim();
  return ADMIN_EMAILS_BLACKLIST.some(adminEmail => 
    adminEmail.toLowerCase() === normalizedEmail
  );
}

/**
 * Vérifier si un email est autorisé à se connecter comme administrateur
 * @param email - Email à vérifier
 * @returns true si l'email est dans la whitelist, false sinon
 */
function isWhitelistedAdmin(email: string | null): boolean {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase().trim();
  return ADMIN_EMAILS_WHITELIST.some(adminEmail => 
    adminEmail.toLowerCase() === normalizedEmail
  );
}

/**
 * Configuration personnalisée des emails Firebase Auth
 * Permet de personnaliser l'URL de redirection après vérification email
 */
function getActionCodeSettings(params?: { 
  role?: 'client' | 'artisan',
  action?: 'verify' | 'reset' | 'change'
}): ActionCodeSettings {
  // ⚠️ Priorité : NEXT_PUBLIC_APP_URL (production) > window.location.origin (dev local)
  // NEXT_PUBLIC_APP_URL doit pointer vers le domaine de production (ex: https://artisandispo.fr)
  // Sans cette variable, les liens d'email pointent vers localhost:3000 → inaccessible depuis Firebase
  const baseUrl = 
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  
  // URL personnalisée selon action
  let redirectUrl = `${baseUrl}/email-verified`;
  if (params?.action === 'reset') {
    redirectUrl = `${baseUrl}/mot-de-passe-redefini`;
  } else if (params?.action === 'change') {
    redirectUrl = `${baseUrl}/email-modifie`;
  }
  
  // Ajouter paramètres de tracking
  const queryParams = new URLSearchParams();
  if (params?.role) {
    queryParams.append('role', params.role);
  }
  if (params?.action) {
    queryParams.append('action', params.action);
  }
  queryParams.append('timestamp', Date.now().toString());
  
  return {
    url: `${redirectUrl}?${queryParams.toString()}`,
    handleCodeInApp: false,
    // ⚠️ NE PAS ajouter iOS/android ici : cela active Firebase Dynamic Links
    // et enveloppe le continueUrl dans /__/auth/links?link=... ce qui casse
    // la redirection si l'URL pointe vers localhost ou un domaine non autorisé.
    // À ajouter uniquement quand l'app mobile React Native sera déployée.
  };
}

/**
 * Traduire les erreurs Firebase Auth en français
 */
function translateAuthError(error: any): string {
  const errorCode = error?.code || '';
  
  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'Cette adresse email est déjà utilisée par un autre compte. Veuillez vous connecter ou utiliser une autre adresse email.';
    case 'auth/invalid-email':
      return 'L\'adresse email n\'est pas valide.';
    case 'auth/operation-not-allowed':
      return 'Cette méthode de connexion n\'est pas activée. Veuillez contacter l\'administrateur ou utiliser une autre méthode.';
    case 'auth/weak-password':
      return 'Le mot de passe est trop faible. Utilisez au moins 6 caractères.';
    case 'auth/user-disabled':
      return 'Ce compte a été désactivé.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Email ou mot de passe incorrect. Vérifiez vos identifiants.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Veuillez réessayer plus tard.';
    case 'auth/network-request-failed':
      return 'Erreur de connexion. Vérifiez votre connexion internet.';
    default:
      return error?.message || 'Une erreur est survenue lors de l\'inscription';
  }
}

export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  representantLegal?: string;
  role: 'client' | 'artisan';
  phone?: string;
}

export interface ArtisanSignUpData extends SignUpData {
  role: 'artisan';
  businessName: string;
  siret?: string;
  metiers: string[];
  location: {
    address: string;
    city: string;
    postalCode: string;
  };
}

/**
 * Service d'authentification Firebase
 */
export const authService = {
  /**
   * Inscription client avec configuration personnalisée
   */
  async signUpClient(data: SignUpData) {
    try {
      // 🔍 VÉRIFICATION PRÉALABLE : Détecter si email existe avec un autre provider
      const methods = await fetchSignInMethodsForEmail(auth, data.email);
      
      if (methods.length > 0) {
        if (methods.includes('google.com')) {
          throw new Error(
            'Ce compte existe déjà avec Google Sign-In. Veuillez vous connecter avec Google.'
          );
        } else {
          // Email existe déjà avec password ou autre provider
          throw new Error('Cette adresse email est déjà utilisée par un autre compte.');
        }
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );

      const user = userCredential.user;

      // Mettre à jour le profil
      await updateProfile(user, {
        displayName: `${data.firstName} ${data.lastName}`,
      });

      // Créer le document utilisateur dans Firestore avec notre nouveau service
      const userData: Omit<UserType, 'id'> = {
        email: data.email,
        nom: data.lastName,
        prenom: data.firstName,
        telephone: data.phone || '',
        role: 'client',
        statut: 'verifie', // Client vérifié par défaut
        preferences: {
          notifications: {
            email: true,
            push: true,
            sms: false,
          },
        },
        dateCreation: Timestamp.now(),
        dateModification: Timestamp.now(),
      };

      await createUser(user.uid, userData);

      // Synchroniser le statut emailVerified dans Firestore
      await syncEmailVerificationStatus(user.uid);

      // Envoyer l'email de vérification
      try {
        await sendEmailVerification(user, {
          url: `${window.location.origin}/email-verified`,
          handleCodeInApp: false,
        });
        console.log('✅ Email de vérification envoyé à', data.email);
      } catch (emailError) {
        console.error('⚠️ Erreur envoi email de vérification:', emailError);
        // Ne pas bloquer l'inscription si l'email échoue
      }

      return user;
    } catch (error: any) {
      console.error('Error signing up client:', error);
      const errorMessage = translateAuthError(error);
      throw new Error(errorMessage);
    }
  },

  /**
   * Inscription artisan
   */
  async signUpArtisan(data: ArtisanSignUpData) {
    try {
      // 🔍 VÉRIFICATION PRÉALABLE : Détecter si email existe avec un autre provider
      const methods = await fetchSignInMethodsForEmail(auth, data.email);
      
      if (methods.length > 0) {
        if (methods.includes('google.com')) {
          throw new Error(
            'Ce compte existe déjà avec Google Sign-In. Veuillez vous connecter avec Google.'
          );
        } else {
          // Email existe déjà avec password ou autre provider
          throw new Error('Cette adresse email est déjà utilisée par un autre compte.');
        }
      }

      // Créer le compte Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );

      const user = userCredential.user;

      // Mettre à jour le profil
      await updateProfile(user, {
        displayName: data.businessName,
      });

      // Créer le document utilisateur avec notre nouveau service
      const userData: Omit<UserType, 'id'> = {
        email: data.email,
        nom: data.lastName,
        prenom: data.firstName,
        representantLegal: data.representantLegal,
        telephone: data.phone || '',
        role: 'artisan',
        statut: 'non_verifie', // Artisan doit être vérifié manuellement
        preferences: {
          notifications: {
            email: true,
            push: true,
            sms: false,
          },
        },
        dateCreation: Timestamp.now(),
        dateModification: Timestamp.now(),
      };

      await createUser(user.uid, userData);

      // Créer le profil artisan public avec notre nouveau service
      const artisanData = {
        userId: user.uid,
        siret: data.siret || '', // SIRET fourni à l'inscription ou à remplir dans le profil
        raisonSociale: data.businessName,
        formeJuridique: 'SARL' as const, // Valeur par défaut, à modifier dans le profil
        metiers: (data.metiers || []) as any[], // Les métiers sont déjà normalisés depuis le formulaire
        zonesIntervention: data.location?.city ? [{
          adresse: data.location.address || '', // Adresse complète de l'entreprise
          ville: data.location.city,
          codePostal: data.location.postalCode || '',
          departements: [],
          rayonKm: 30, // Rayon par défaut
        }] : [],
        disponibilites: [], // À remplir dans l'agenda
        notation: 0,
        nombreAvis: 0,
        
        // Vérification SIRET
        siretVerified: false,
        
        // Nouveau système de vérification
        verified: false, // Sera mis à true après vérification admin
        verificationStatus: 'pending' as const,

        
        statut: 'inactif' as const, // Inactif jusqu'à vérification
      };

      await createArtisan(artisanData);

      // Synchroniser le statut emailVerified dans Firestore
      await syncEmailVerificationStatus(user.uid);

      // Envoyer l'email de vérification avec configuration personnalisée (OBLIGATOIRE pour artisans)
      try {
        await sendEmailVerification(
          user, 
          getActionCodeSettings({ role: 'artisan', action: 'verify' })
        );
        console.log('✅ Email de vérification envoyé à', data.email);
      } catch (emailError) {
        console.error('⚠️ Erreur envoi email de vérification:', emailError);
        // Ne pas bloquer l'inscription si l'email échoue
      }

      return user;
    } catch (error: any) {
      console.error('Error signing up artisan:', error);
      const errorMessage = translateAuthError(error);
      throw new Error(errorMessage);
    }
  },

  /**
   * Connexion (approche sécurisée avec message générique)
   */
  async signIn(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Synchroniser le statut emailVerified
      await syncEmailVerificationStatus(userCredential.user.uid);
      
      return userCredential.user;
    } catch (error: any) {
      const errorMessage = translateAuthError(error);
      throw new Error(errorMessage);
    }
  },

  /**
   * Connexion avec Google (OAuth)
   * Comportement adapté au marché : permet Account Linking via Firebase Email Enumeration Protection
   * 
   * IMPORTANT : Activer "Email enumeration protection" dans Firebase Console
   * → Authentication → Settings → Email enumeration protection
   * 
   * Effet : Firebase lie automatiquement les providers au même compte
   * → User peut se connecter avec email/password OU Google (même UID)
   * 
   * Retourne l'utilisateur et un indicateur si c'est une nouvelle inscription
   */
  async signInWithGoogle(): Promise<{ user: User; isNewUser: boolean; existingRole?: 'client' | 'artisan' | 'admin' }> {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account' // Force la sélection du compte à chaque fois
      });

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // 🔒 SÉCURITÉ NIVEAU 1 : Vérifier si l'email fait partie de la blacklist admin
      // Cette vérification se fait AVANT toute création de document Firestore
      if (isAdminEmail(user.email)) {
        await firebaseSignOut(auth);
        throw new Error('Les administrateurs doivent se connecter via l\'interface dédiée.');
      }

      // Note : Avec Email Enumeration Protection activée dans Firebase Console,
      // si l'email existe déjà avec un provider password, Firebase liera automatiquement
      // le provider Google au compte existant (même UID). Pas besoin de bloquer ici.

      // Vérifier si l'utilisateur existe déjà dans Firestore
      const { getDoc } = await import('firebase/firestore');
      const userDoc = await getDoc(doc(db, 'users', user.uid));

      if (userDoc.exists()) {
        // Utilisateur existant
        const userData = userDoc.data() as UserType;
        
        // Synchroniser le statut emailVerified (Google vérifie automatiquement l'email)
        await syncEmailVerificationStatus(user.uid);
        
        // 🔒 SÉCURITÉ NIVEAU 2 : Vérifier le rôle dans Firestore
        // Double vérification pour les comptes existants
        if (userData.role === 'admin') {
          // Déconnecter immédiatement les admins
          await firebaseSignOut(auth);
          throw new Error('Les administrateurs doivent se connecter via l\'interface dédiée.');
        }

        return { 
          user, 
          isNewUser: false, 
          existingRole: userData.role 
        };
      } else {
        // Nouvel utilisateur - il faudra choisir le rôle
        // On ne crée pas encore le document Firestore
        // L'utilisateur sera redirigé vers une page de sélection de rôle
        return { 
          user, 
          isNewUser: true 
        };
      }
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      
      // Gestion spécifique des erreurs OAuth
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Connexion annulée');
      } else if (error.code === 'auth/popup-blocked') {
        throw new Error('Popup bloquée par le navigateur. Veuillez autoriser les popups.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        throw new Error('Connexion annulée');
      }
      
      const errorMessage = translateAuthError(error);
      throw new Error(errorMessage);
    }
  },

  /**
   * Compléter l'inscription Google avec le rôle choisi
   * À appeler après signInWithGoogle pour les nouveaux utilisateurs
   */
  async completeGoogleSignUp(role: 'client' | 'artisan', phone?: string) {
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Aucun utilisateur connecté');
      }

      // 🔒 SÉCURITÉ : Double vérification email admin
      // Empêche toute manipulation de l'interface pour créer un compte admin
      if (isAdminEmail(user.email)) {
        await firebaseSignOut(auth);
        throw new Error('Les administrateurs doivent se connecter via l\'interface dédiée.');
      }

      // 🔒 SÉCURITÉ : Interdire la création directe de comptes admin
      // Le rôle admin ne peut être attribué QUE via le script create-admin.js
      if (role === 'admin') {
        await firebaseSignOut(auth);
        throw new Error('Action non autorisée');
      }

      // Extraire nom et prénom depuis displayName de Google
      const displayName = user.displayName || '';
      const nameParts = displayName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Créer le document utilisateur dans Firestore
      const userData: Omit<UserType, 'id'> = {
        email: user.email || '',
        nom: lastName,
        prenom: firstName,
        telephone: phone || '',
        role: role,
        statut: role === 'client' ? 'verifie' : 'non_verifie',
        preferences: {
          notifications: {
            email: true,
            push: true,
            sms: false,
          },
        },
        dateCreation: Timestamp.now(),
        dateModification: Timestamp.now(),
      };

      await createUser(user.uid, userData);

      // Si artisan, créer aussi le profil artisan (profil minimal)
      if (role === 'artisan') {
        const artisanData = {
          userId: user.uid,
          siret: '',
          raisonSociale: displayName || 'À compléter',
          formeJuridique: 'SARL' as const,
          metiers: [],
          zonesIntervention: [],
          disponibilites: [],
          notation: 0,
          nombreAvis: 0,
          siretVerified: false,
          verified: false,
          verificationStatus: 'pending' as const,
          statut: 'inactif' as const,
        };

        await createArtisan(artisanData);
      }

      // Synchroniser le statut emailVerified (Google vérifie automatiquement)
      await syncEmailVerificationStatus(user.uid);

      return user;
    } catch (error: any) {
      console.error('Error completing Google sign up:', error);
      throw new Error('Erreur lors de la finalisation de l\'inscription');
    }
  },

  /**
   * Déconnexion
   */
  async signOut() {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  },

  /**
   * Observer l'état d'authentification
   */
  onAuthStateChanged(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  },

  /**
   * Récupérer l'utilisateur actuel
   */
  getCurrentUser() {
    return auth.currentUser;
  },

  /**
   * Renvoyer l'email de vérification
   */
  async resendVerificationEmail() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Aucun utilisateur connecté');
    }

    if (user.emailVerified) {
      throw new Error('Email déjà vérifié');
    }

    try {
      // Récupérer le rôle de l'utilisateur depuis Firestore
      const userDoc = await import('firebase/firestore').then(mod => 
        mod.getDoc(doc(db, 'users', user.uid))
      );
      const userData = userDoc.exists() ? userDoc.data() as UserType : null;
      const userRole = userData?.role || 'client';

      // Envoyer email de vérification avec configuration personnalisée
      await sendEmailVerification(
        user, 
        getActionCodeSettings({ role: userRole, action: 'verify' })
      );
      console.log('✅ Email de vérification renvoyé');
    } catch (error) {
      console.error('Erreur renvoi email:', error);
      throw error;
    }
  },

  /**
   * Réinitialiser le mot de passe
   */
  async resetPassword(email: string) {
    try {
      await sendPasswordResetEmail(
        auth, 
        email,
        getActionCodeSettings({ action: 'reset' })
      );
      return { success: true, message: 'Email de réinitialisation envoyé' };
    } catch (error: any) {
      return { 
        success: false, 
        error: translateAuthError(error) 
      };
    }
  },
};

// Exports individuels pour faciliter l'import
export const signUpClient = authService.signUpClient.bind(authService);
export const signUpArtisan = authService.signUpArtisan.bind(authService);
export const signIn = authService.signIn.bind(authService);
export const signInWithGoogle = authService.signInWithGoogle.bind(authService);
export const completeGoogleSignUp = authService.completeGoogleSignUp.bind(authService);
export { isWhitelistedAdmin };
export const signOut = authService.signOut.bind(authService);
export const getCurrentUser = authService.getCurrentUser.bind(authService);
export const resendVerificationEmail = authService.resendVerificationEmail.bind(authService);
export const resetPassword = authService.resetPassword.bind(authService);
export const onAuthChanged = authService.onAuthStateChanged.bind(authService);

