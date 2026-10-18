'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { 
  testEmailVerification, 
  checkEmailVerificationStatus,
  refreshEmailVerificationStatus 
} from '@/lib/test-email-verification';

/**
 * Page de test pour l'envoi d'emails de vérification
 * Accessible à : http://localhost:3000/test-email
 */
export default function TestEmailPage() {
  const [status, setStatus] = useState<any>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [refreshResult, setRefreshResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function handleCheckStatus() {
    const result = checkEmailVerificationStatus();
    setStatus(result);
  }

  async function handleTestEmail() {
    setLoading(true);
    setTestResult(null);
    
    const result = await testEmailVerification();
    setTestResult(result);
    setLoading(false);
  }

  async function handleRefreshStatus() {
    setLoading(true);
    const result = await refreshEmailVerificationStatus();
    setRefreshResult(result);
    setLoading(false);
    
    // Rafraîchir aussi le statut
    handleCheckStatus();
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <h1 className="text-3xl font-bold text-navy-800 mb-6">
          Test Email de Vérification Firebase
        </h1>

        <div className="space-y-6">
          {/* Statut utilisateur */}
          <Card>
            <h2 className="text-xl font-bold text-navy-800 mb-4">
              1️⃣ Vérifier le statut utilisateur
            </h2>
            <Button 
              onClick={handleCheckStatus}
              className="bg-brand-700 hover:bg-brand-800 text-white"
            >
              Vérifier le statut
            </Button>

            {status && (
              <div className="mt-4 p-4 bg-slate-100 rounded-lg">
                <pre className="text-sm overflow-auto">
                  {JSON.stringify(status, null, 2)}
                </pre>
              </div>
            )}
          </Card>

          {/* Test envoi email */}
          <Card>
            <h2 className="text-xl font-bold text-navy-800 mb-4">
              2️⃣ Envoyer un email de vérification
            </h2>
            <p className="text-slate-500 mb-4">
              Vous devez être connecté avec un compte non vérifié pour tester l'envoi.
            </p>
            <Button 
              onClick={handleTestEmail}
              disabled={loading}
              className="bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50"
            >
              {loading ? 'Envoi en cours...' : 'Envoyer l\'email de test'}
            </Button>

            {testResult && (
              <div className={`mt-4 p-4 rounded-lg ${
                testResult.success ? 'bg-green-100 border border-green-300' : 'bg-red-100 border border-red-300'
              }`}>
                <h3 className="font-bold mb-2">
                  {testResult.success ? '✅ Succès' : '❌ Erreur'}
                </h3>
                <pre className="text-sm overflow-auto">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
                
                {testResult.success && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-sm text-blue-800">
                      📬 Vérifiez votre boîte de réception (et le dossier spam) de <strong>{testResult.email}</strong>
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Rafraîchir statut vérification */}
          <Card>
            <h2 className="text-xl font-bold text-navy-800 mb-4">
              3️⃣ Rafraîchir le statut de vérification
            </h2>
            <p className="text-slate-500 mb-4">
              Après avoir cliqué sur le lien dans l'email, rafraîchissez le statut ici.
            </p>
            <Button 
              onClick={handleRefreshStatus}
              disabled={loading}
              className="bg-navy-800 hover:bg-navy-900 text-white disabled:opacity-50"
            >
              {loading ? 'Vérification...' : 'Rafraîchir le statut'}
            </Button>

            {refreshResult && (
              <div className={`mt-4 p-4 rounded-lg ${
                refreshResult.emailVerified ? 'bg-green-100 border border-green-300' : 'bg-yellow-100 border border-yellow-300'
              }`}>
                <h3 className="font-bold mb-2">
                  {refreshResult.emailVerified ? '✅ Email vérifié !' : '⏳ Email non vérifié'}
                </h3>
                <pre className="text-sm overflow-auto">
                  {JSON.stringify(refreshResult, null, 2)}
                </pre>
              </div>
            )}
          </Card>

          {/* Instructions */}
          <Card className="bg-blue-50 border-2 border-blue-200">
            <h2 className="text-xl font-bold text-navy-800 mb-4">
              📋 Instructions
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-navy-800">
              <li>Inscrivez-vous avec un compte de test sur <a href="/inscription" className="text-brand-700 underline">la page d'inscription</a></li>
              <li>Revenez sur cette page et vérifiez votre statut (étape 1)</li>
              <li>Envoyez un email de test (étape 2)</li>
              <li>Vérifiez votre boîte email (et spam)</li>
              <li>Cliquez sur le lien dans l'email</li>
              <li>Rafraîchissez le statut (étape 3)</li>
            </ol>

            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-800">
                ⚠️ <strong>Note :</strong> Si l'email ne s'envoie pas, consultez la documentation dans <code>docs/FIREBASE_EMAIL_VERIFICATION_SETUP.md</code>
              </p>
            </div>
          </Card>

          {/* Diagnostic */}
          <Card className="bg-red-50 border-2 border-red-200">
            <h2 className="text-xl font-bold text-red-800 mb-4">
              🔍 Diagnostic des problèmes courants
            </h2>
            <ul className="list-disc list-inside space-y-2 text-red-800 text-sm">
              <li><strong>Email non reçu :</strong> Vérifiez le dossier spam, vérifiez que le template est configuré dans Firebase Console</li>
              <li><strong>Erreur "too-many-requests" :</strong> Quota Firebase dépassé, attendez quelques heures</li>
              <li><strong>Erreur réseau :</strong> Vérifiez votre connexion internet</li>
              <li><strong>Email déjà vérifié :</strong> L'email a déjà été confirmé, pas besoin de renvoyer</li>
            </ul>

            <div className="mt-4">
              <a 
                href="https://console.firebase.google.com/project/artisansafe/authentication/emails"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline font-medium"
              >
                📝 Configurer les templates d'email dans Firebase →
              </a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
