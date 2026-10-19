'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, dateFnsLocalizer, Views, SlotInfo, Navigate, ToolbarProps } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays, eachDayOfInterval, isSameDay, startOfMonth, endOfMonth, eachWeekOfInterval, addMonths, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { authService } from '@/lib/auth-service';
import { getArtisanByUserId } from '@/lib/firebase/artisan-service';
import { useAgendaData, invalidateAgendaCache } from '@/hooks/useAgendaData';
import type { DisponibiliteSlot, Artisan } from '@/types/firestore';
import { Timestamp } from 'firebase/firestore';
import { useLanguage } from '@/contexts/LanguageContext';

// Configuration du localisateur français
const locales = {
  'fr': fr,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// Types pour les créneaux de disponibilité (pour le calendrier)
interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  disponible: boolean;
  recurrence?: 'hebdomadaire' | 'ponctuel';
  allDay?: boolean; // Journée complète ou plage horaire
  isContrat?: boolean; // Flag pour les périodes de contrat (non supprimables, affichage rouge)
}

export default function AgendaPage() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [artisanId, setArtisanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectingStart, setSelectingStart] = useState(true);
  const [calendarMode, setCalendarMode] = useState<'start' | 'end'>('start');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState(Views.MONTH);
  
  // État pour le modal d'édition d'événement
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  
  // État pour la recherche par plage de dates dans l'agenda
  const [searchStartDate, setSearchStartDate] = useState('');
  const [searchEndDate, setSearchEndDate] = useState('');

  // ⚡ Hook optimisé avec cache
  const { disponibilites, contrats, loading: dataLoading, error } = useAgendaData(artisanId);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  // Effet pour générer les événements du calendrier
  useEffect(() => {
    if (!disponibilites && !contrats) return;
    
    generateCalendarEvents();
  }, [disponibilites, contrats]);

  // Effet pour appliquer automatiquement le filtrage par dates
  useEffect(() => {
    if (searchStartDate && searchEndDate && currentView === Views.AGENDA) {
      setCurrentDate(new Date(searchStartDate));
    }
  }, [searchStartDate, searchEndDate, currentView]);

  const checkAuth = async () => {
    const user = authService.getCurrentUser();
    if (!user) {
      router.push('/connexion');
      return;
    }
    
    await loadArtisanProfile();
  };

  const loadArtisanProfile = async () => {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) return;

      const artisanData = await getArtisanByUserId(currentUser.uid);
      
      if (!artisanData || !artisanData.id) {
        alert(t('artisanAgenda.errors.profileIncomplete'));
        router.push('/artisan/profil');
        return;
      }

      setArtisanId(artisanData.id);
    } catch (error) {
      console.error('Erreur chargement profil:', error);
    } finally {
      setInitialLoading(false);
    }
  };

  const generateCalendarEvents = () => {
    console.log('⚡ Génération des événements calendrier...');
    const startTime = Date.now();
      
      // Convertir DisponibiliteSlot[] en CalendarEvent[] (journées complètes)
      const calendarEvents: CalendarEvent[] = disponibilites.map(dispo => {
        let start: Date;
        let end: Date;

        if (dispo.recurrence === 'ponctuel' && dispo.date) {
          // Créneau ponctuel - journée complète
          const dateBase = dispo.date.toDate();
          
          start = new Date(dateBase);
          start.setHours(0, 0, 0, 0);
          
          end = new Date(dateBase);
          end.setHours(23, 59, 59, 999);
        } else {
          // Créneau hebdomadaire - journée complète
          const today = new Date();
          
          start = new Date(today);
          start.setHours(0, 0, 0, 0);
          
          end = new Date(today);
          end.setHours(23, 59, 59, 999);
        }

        return {
          id: dispo.id || String(Date.now()),
          title: dispo.titre || (dispo.disponible ? t('artisanAgenda.defaults.available') : t('artisanAgenda.defaults.unavailable')),
          start,
          end,
          disponible: dispo.disponible,
          recurrence: dispo.recurrence,
          allDay: true
        };
      });
      
      // Ajouter les contrats signés (devis payés) comme indisponibilités automatiques
      // ⚡ OPTIMISATION: Limiter aux 6 prochains mois pour éviter surcharge
      const sixMonthsFromNow = addMonths(new Date(), 6);
      const contratEvents: CalendarEvent[] = contrats
        .filter(devis => 
          // Un devis payé/en cours = période d'occupation
          ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(devis.statut) && 
          devis.dateDebutPrevue && 
          devis.delaiRealisation &&
          devis.dateDebutPrevue.toDate() <= sixMonthsFromNow // Limite temporelle
        )
        .flatMap(devis => {
          const dateDebut = devis.dateDebutPrevue!.toDate();
          
          // Calculer la date de fin basée sur le délai de réalisation
          const dateFin = addDays(dateDebut, devis.delaiRealisation);
          
          // ⚡ OPTIMISATION: Limiter à 100 jours par contrat maximum
          const actualDateFin = new Date(Math.min(dateFin.getTime(), addDays(dateDebut, 100).getTime()));
          
          // Créer un événement pour chaque jour du contrat
          const daysInRange = eachDayOfInterval({ start: dateDebut, end: actualDateFin });
          
          // Numéro de devis à afficher
          const numeroDevis = devis.numeroDevis || devis.id.slice(0, 8);
          
          return daysInRange.map((day, index) => {
            const eventStart = new Date(day);
            eventStart.setHours(0, 0, 0, 0);
            
            const eventEnd = new Date(day);
            eventEnd.setHours(23, 59, 59, 999);
            
            return {
              id: `contrat_${devis.id}_${index}`,
              title: `🔒 Devis ${numeroDevis}`,
              start: eventStart,
              end: eventEnd,
              disponible: false, // Indisponible
              recurrence: 'ponctuel' as const,
              allDay: true,
              isContrat: true, // Flag pour le style rouge
            };
          });
        });
      
    // Combiner les événements de disponibilités et les contrats
    const totalEvents = [...calendarEvents, ...contratEvents];
    console.log(`✅ Total événements créés: ${totalEvents.length}`);
    console.log(`⏱️  Temps génération: ${Date.now() - startTime}ms`);
    
    setEvents(totalEvents);
  };

  const handleSelectSlot = (slotInfo: SlotInfo) => {
    const { start, end } = slotInfo;
    
    // Empêcher la sélection de dates passées
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start < today) {
      alert(t('artisanAgenda.errors.noPastDates'));
      return;
    }
    
    // Vérifier si le jour sélectionné contient déjà un événement
    const clickedDate = new Date(start);
    clickedDate.setHours(0, 0, 0, 0);
    
    const existingEvent = events.find(event => {
      const eventDate = new Date(event.start);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate.getTime() === clickedDate.getTime();
    });
    
    // Si un événement existe déjà, ouvrir le modal d'édition
    if (existingEvent) {
      handleSelectEvent(existingEvent);
      return;
    }
    
    // Calculer le nombre de jours dans la sélection
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    const title = window.prompt(t('artisanAgenda.prompts.eventTitle'), t('artisanAgenda.defaults.unavailable'));
    if (!title) return;
    
    // Créer un événement pour chaque jour de la plage (journée complète)
    const newEvents: CalendarEvent[] = [];
    const daysInRange = eachDayOfInterval({ start, end: addDays(end, -1) });
    
    daysInRange.forEach((day, index) => {
      let eventStart = new Date(day);
      let eventEnd = new Date(day);
      
      // Journée complète (toute la journée)
      eventStart.setHours(0, 0, 0, 0);
      eventEnd.setHours(23, 59, 59, 999);
      
      const newEvent: CalendarEvent = {
        id: `${Date.now()}_${index}`,
        title,
        start: eventStart,
        end: eventEnd,
        disponible: false,
        recurrence: 'ponctuel',
        allDay: true
      };
      newEvents.push(newEvent);
    });
    
    setEvents([...events, ...newEvents]);
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    // Empêcher la modification des événements de contrat
    if (event.id.startsWith('contrat_')) {
      alert(t('artisanAgenda.errors.contractEditError'));
      return;
    }
    
    // Ouvrir le modal d'édition
    setEditingEvent(event);
    setEditedTitle(event.title);
  };

  const handleSaveEdit = () => {
    if (!editingEvent || !editedTitle.trim()) {
      return;
    }

    // Empêcher la modification des périodes de contrat
    if (editingEvent.isContrat) {
      alert(t('artisanAgenda.errors.contractModifyError'));
      return;
    }

    setEvents(events.map(e => 
      e.id === editingEvent.id 
        ? { ...e, title: editedTitle.trim() }
        : e
    ));
    
    setEditingEvent(null);
    setEditedTitle('');
  };

  const handleDeleteEvent = () => {
    if (!editingEvent) return;
    
    // Empêcher la suppression des périodes de contrat
    if (editingEvent.isContrat) {
      alert(t('artisanAgenda.editModal.deleteContractError'));
      return;
    }
    
    const confirmDelete = window.confirm(t('artisanAgenda.editModal.deleteConfirm').replace('{title}', editingEvent.title));
    if (confirmDelete) {
      setEvents(events.filter(e => e.id !== editingEvent.id));
      setEditingEvent(null);
      setEditedTitle('');
    }
  };

  const handleCloseEditModal = () => {
    setEditingEvent(null);
    setEditedTitle('');
  };

  const handleCreateRangeDisponibilite = () => {
    if (!rangeStart || !rangeEnd) {
      alert(t('artisanAgenda.quickModal.errorNoDate'));
      return;
    }

    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);

    if (start > end) {
      alert(t('artisanAgenda.quickModal.errorInvalidRange'));
      return;
    }

    const title = window.prompt(t('artisanAgenda.quickModal.titlePrompt'), t('artisanAgenda.quickModal.defaultTitle'));
    if (!title) return;

    const newEvents: CalendarEvent[] = [];
    const daysInRange = eachDayOfInterval({ start, end });

    daysInRange.forEach((day, index) => {
      const eventStart = new Date(day);
      eventStart.setHours(0, 0, 0, 0);
      
      const eventEnd = new Date(day);
      eventEnd.setHours(23, 59, 59, 999);

      const newEvent: CalendarEvent = {
        id: `range_${Date.now()}_${index}`,
        title,
        start: eventStart,
        end: eventEnd,
        disponible: false,
        recurrence: 'ponctuel',
        allDay: true
      };
      newEvents.push(newEvent);
    });

    setEvents([...events, ...newEvents]);
    setShowRangeModal(false);
    setRangeStart('');
    setRangeEnd('');
    setSelectingStart(true);
    alert(t('artisanAgenda.quickModal.successMessage').replace('{count}', String(newEvents.length)));
  };

  const handleDateClick = (date: Date) => {
    const dateString = format(date, 'yyyy-MM-dd');
    
    if (selectingStart) {
      setRangeStart(dateString);
      setRangeEnd('');
      setSelectingStart(false);
    } else {
      if (new Date(dateString) < new Date(rangeStart)) {
        setRangeStart(dateString);
        setRangeEnd(rangeStart);
      } else {
        setRangeEnd(dateString);
      }
    }
  };

  const getDaysInMonth = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days: Date[] = [];
    
    // Obtenir le premier jour de la semaine pour ce mois
    const firstDayOfMonth = startOfWeek(start, { locale: fr });
    
    // Calculer le nombre de jours à afficher
    // Trouver combien de jours avant le 1er du mois
    let current = firstDayOfMonth;
    while (current < start) {
      days.push(null as any); // Cellule vide pour les jours hors mois
      current = addDays(current, 1);
    }
    
    // Ajouter tous les jours du mois en cours
    current = start;
    while (current <= end) {
      days.push(current);
      current = addDays(current, 1);
    }
    
    // Compléter jusqu'à avoir un multiple de 7 (semaine complète)
    const remainder = days.length % 7;
    if (remainder !== 0) {
      for (let i = 0; i < 7 - remainder; i++) {
        days.push(null as any); // Cellule vide après le dernier jour
      }
    }
    
    return days;
  };

  const isDateInRange = (date: Date) => {
    if (!rangeStart) return false;
    const start = new Date(rangeStart);
    if (!rangeEnd) return isSameDay(date, start);
    const end = new Date(rangeEnd);
    return date >= start && date <= end;
  };

  const isDateStart = (date: Date) => {
    if (!rangeStart) return false;
    return isSameDay(date, new Date(rangeStart));
  };

  const isDateEnd = (date: Date) => {
    if (!rangeEnd) return false;
    return isSameDay(date, new Date(rangeEnd));
  };

  // Navigation handlers pour le calendrier principal
  const handleNavigate = (newDate: Date) => {
    setCurrentDate(newDate);
  };

  const handleViewChange = (view: typeof Views[keyof typeof Views]) => {
    setCurrentView(view);
  };

  const eventStyleGetter = (event: CalendarEvent) => {
    // Contrats/devis signés : affichage rouge, non modifiable
    if (event.isContrat) {
      return {
        style: {
          backgroundColor: '#DC3545', // Rouge
          borderRadius: '5px',
          opacity: 0.9,
          color: 'white',
          border: '2px solid #A62A2A',
          display: 'block',
          fontWeight: 'bold',
          cursor: 'not-allowed' // Curseur interdit pour indiquer non modifiable
        }
      };
    }
    
    // Disponibilités manuelles : vert (disponible) ou rouge (occupé)
    const backgroundColor = event.disponible ? '#28A745' : '#DC3545';
    const style = {
      backgroundColor,
      borderRadius: '5px',
      opacity: 0.8,
      color: 'white',
      border: '0px',
      display: 'block'
    };
    return { style };
  };

  const handleSave = async () => {
    if (!artisanId) {
      alert('Erreur: Artisan non identifié');
      return;
    }

    setSaving(true);
    try {
      const { disponibiliteService } = await import('@/lib/firebase/disponibilite-service');
      
      // Filtrer les événements de contrat (ne pas les sauvegarder car générés automatiquement)
      const userEvents = events.filter(event => !event.isContrat);
      
      // Convertir CalendarEvent[] en DisponibiliteSlot[] (sans heures)
      const disponibilites: DisponibiliteSlot[] = userEvents.map(event => {
        const dispo: DisponibiliteSlot = {
          id: event.id,
          heureDebut: '00:00',
          heureFin: '23:59',
          recurrence: event.recurrence || 'ponctuel',
          disponible: event.disponible,
          titre: event.title
        };

        if (event.recurrence === 'ponctuel') {
          dispo.date = Timestamp.fromDate(event.start);
        }

        return dispo;
      });

      await disponibiliteService.setDisponibilites(artisanId, disponibilites);
      
      // Invalider le cache après sauvegarde
      invalidateAgendaCache(artisanId);
      
      alert(t('artisanAgenda.actions.saveSuccess'));
      router.push('/artisan/dashboard');
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert(t('artisanAgenda.actions.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const loading = initialLoading || dataLoading;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4"></div>
          <p className="text-slate-600">{t('artisanAgenda.loading.title')}</p>
          {dataLoading && <p className="text-sm text-slate-500 mt-2">{t('artisanAgenda.loading.data')}</p>}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center text-red-600">
          <p className="text-xl font-bold mb-2">❌ {t('artisanAgenda.error.title')}</p>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-brand-700 text-white rounded-lg hover:bg-brand-800"
          >
            {t('artisanAgenda.error.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-navy-800 text-white py-8">
        <div className="container mx-auto px-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-white hover:text-brand-300 mb-4 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('artisanAgenda.backButton')}
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">{t('artisanAgenda.pageTitle')}</h1>
              <p className="text-slate-300 mt-2">{t('artisanAgenda.pageDescription')}</p>
            </div>
            <div className="relative">
                <button
                  onClick={() => setShowRangeModal(true)}
                  className="px-4 py-2 bg-brand-700 text-white rounded-lg hover:bg-brand-800 font-medium flex items-center gap-2 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {t('artisanAgenda.quickSelection')}
                </button>

                {/* Modal Sélection Rapide - Descend du bouton */}
                {showRangeModal && (
                  <>
                    {/* Overlay transparent pour fermer au clic extérieur */}
                    <div 
                      className="fixed inset-0 z-40"
                      onClick={() => {
                        setShowRangeModal(false);
                        setRangeStart('');
                        setRangeEnd('');
                        setSelectingStart(true);
                      }}
                    />
                    
                    {/* Popup qui descend du bouton */}
                    <div className="absolute top-full right-0 mt-2 w-96 z-50 animate-slideDown">
                      <div className="bg-white rounded-2xl shadow-lg">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200">
                  <h2 className="text-xl font-bold text-navy-800">
                    {t('artisanAgenda.quickModal.title')}
                  </h2>
                  <button
                    onClick={() => {
                      setShowRangeModal(false);
                      setRangeStart('');
                      setRangeEnd('');
                      setSelectingStart(true);
                    }}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Onglets Date de début / Date de fin */}
                <div className="flex border-b border-slate-200">
                  <button 
                    onClick={() => setCalendarMode('start')}
                    className={`flex-1 px-4 py-3 text-sm font-semibold ${
                      calendarMode === 'start' 
                        ? 'text-navy-800 border-b-2 border-brand-500' 
                        : 'text-slate-500'
                    }`}
                  >
                    📅 {rangeStart ? format(new Date(rangeStart), 'dd/MM/yyyy', { locale: fr }) : t('artisanAgenda.quickModal.startLabel')}
                  </button>
                  <button 
                    onClick={() => setCalendarMode('end')}
                    className={`flex-1 px-4 py-3 text-sm font-semibold ${
                      calendarMode === 'end' 
                        ? 'text-navy-800 border-b-2 border-brand-500' 
                        : 'text-slate-500'
                    }`}
                  >
                    📅 {rangeEnd ? format(new Date(rangeEnd), 'dd/MM/yyyy', { locale: fr }) : t('artisanAgenda.quickModal.endLabel')}
                  </button>
                </div>

                {/* Calendrier */}
                <div className="p-4">
                  {/* Navigation mois */}
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-brand-700 transition-colors"
                      type="button"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <h3 className="text-lg font-semibold text-navy-800">
                      {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                    </h3>
                    <button
                      onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-brand-700 transition-colors"
                      type="button"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  {/* Jours de la semaine */}
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day, idx) => (
                      <div key={day} className={`text-center text-xs font-medium py-2 ${idx >= 5 ? 'text-slate-400' : 'text-navy-800'}`}>
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Grille de dates */}
                  <div className="grid grid-cols-7 gap-1">
                    {getDaysInMonth().map((day, idx) => {
                      // Cellule vide pour les jours hors mois
                      if (!day) {
                        return <div key={idx} className="aspect-square" />;
                      }
                      
                      const isToday = isSameDay(day, new Date());
                      const inRange = isDateInRange(day);
                      const isStart = isDateStart(day);
                      const isEnd = isDateEnd(day);
                      
                      // Vérifier si la date est dans le passé
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const isPast = day < today;
                      
                      return (
                        <button
                          key={idx}
                          onClick={() => !isPast && handleDateClick(day)}
                          disabled={isPast}
                          className={`
                            aspect-square flex items-center justify-center text-sm rounded-full
                            ${isPast ? 'text-slate-300 cursor-not-allowed opacity-40 bg-slate-50' : 'text-slate-700 hover:bg-slate-100'}
                            ${isToday && !inRange && !isPast ? 'border-2 border-navy-800' : ''}
                            ${inRange && !isStart && !isEnd && !isPast ? 'bg-purple-100' : ''}
                            ${(isStart || isEnd) && !isPast ? 'bg-navy-800 text-white font-bold' : ''}
                          `}
                        >
                          {format(day, 'd')}
                        </button>
                      );
                    })}
                  </div>

                  {/* Info sélection */}
                  {rangeStart && (
                    <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm">
                      <p className="text-slate-700">
                        {rangeEnd ? (
                          <>📅 {t('artisanAgenda.quickModal.from')} <strong>{format(new Date(rangeStart), 'dd/MM/yyyy', { locale: fr })}</strong> {t('artisanAgenda.quickModal.to')} <strong>{format(new Date(rangeEnd), 'dd/MM/yyyy', { locale: fr })}</strong></>
                        ) : (
                          <>📅 {t('artisanAgenda.quickModal.startSelected')}: <strong>{format(new Date(rangeStart), 'dd/MM/yyyy', { locale: fr })}</strong> - {t('artisanAgenda.quickModal.selectEndDate')}</>
                        )}
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer avec boutons */}
                <div className="p-4 bg-slate-50 rounded-b-2xl flex gap-3">
                  <button
                    onClick={() => {
                      setShowRangeModal(false);
                      setRangeStart('');
                      setRangeEnd('');
                      setSelectingStart(true);
                    }}
                    className="flex-1 px-4 py-3 border-2 border-slate-300 text-slate-700 rounded-xl hover:bg-white font-semibold transition-colors"
                  >
                    {t('artisanAgenda.quickModal.closeButton')}
                  </button>
                  <button
                    onClick={handleCreateRangeDisponibilite}
                    disabled={!rangeStart || !rangeEnd}
                    className="flex-1 px-4 py-3 bg-brand-700 text-white rounded-xl hover:bg-brand-800 font-semibold transition-colors shadow-lg hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('artisanAgenda.quickModal.createButton')}
                  </button>
                </div>
              </div>
                    </div>
                  </>
                )}
              </div>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="container mx-auto px-4 py-8">
        {/* Instructions - Tooltip au survol */}
        <div className="mb-6 relative group">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 cursor-help">
            <h2 className="font-semibold text-navy-800">{t('artisanAgenda.instructions.title')}</h2>
          </div>
          
          {/* Tooltip qui s'affiche au survol */}
          <div className="absolute left-0 right-0 top-full mt-2 bg-white border-2 border-slate-300 rounded-lg p-5 shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300">
            <ul className="text-sm text-slate-800 space-y-2">
              <li>• <strong>{t('artisanAgenda.quickSelection')}</strong> : {t('artisanAgenda.instructions.quickSelection')}</li>
              <li>• <strong>{t('artisanAgenda.calendar.agenda')}</strong> : {t('artisanAgenda.instructions.agendaView')}</li>
              <li>• <strong>{t('artisanAgenda.calendar.month')}</strong> : {t('artisanAgenda.instructions.calendarView')}
                <ul className="ml-6 mt-1 space-y-1">
                  <li>◦ {t('artisanAgenda.instructions.clickDay')}</li>
                  <li>◦ {t('artisanAgenda.instructions.clickEvent')}</li>
                  <li>◦ {t('artisanAgenda.instructions.colors')}</li>
                </ul>
              </li>
              <li>• <strong>🔒 {t('artisanAgenda.legend.contract')}</strong> : {t('artisanAgenda.instructions.contracts')}</li>
            </ul>
          </div>
        </div>

        {/* Calendrier */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-hidden" style={{ height: '700px', maxWidth: '100%' }}>
          {/* Barre de recherche par dates - Visible uniquement en vue Agenda */}
          {currentView === Views.AGENDA && (
            <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('artisanAgenda.dateFilters.startDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={searchStartDate}
                    onChange={(e) => setSearchStartDate(e.target.value)}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-brand-500 focus:outline-none cursor-pointer"
                  />
                </div>
                
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('artisanAgenda.dateFilters.endDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={searchEndDate}
                    onChange={(e) => setSearchEndDate(e.target.value)}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-brand-500 focus:outline-none cursor-pointer"
                  />
                </div>
                
                <div>
                  <button
                    onClick={() => {
                      setSearchStartDate('');
                      setSearchEndDate('');
                      setCurrentDate(new Date());
                    }}
                    className="px-4 py-2 border-2 border-brand-500 text-brand-700 rounded-lg hover:bg-orange-50 font-medium transition-colors"
                  >
                    {t('artisanAgenda.dateFilters.resetButton')}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            allDayAccessor="allDay"
            style={{ height: '100%' }}
            views={[Views.MONTH, Views.AGENDA]}
            view={currentView}
            onView={handleViewChange}
            date={currentDate}
            onNavigate={handleNavigate}
            length={searchStartDate && searchEndDate ? 
              Math.ceil((new Date(searchEndDate).getTime() - new Date(searchStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1 : 
              365
            }
            selectable
            selectMirror
            longPressThreshold={250}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            messages={{
              month: t('artisanAgenda.calendar.month'),
              previous: t('artisanAgenda.calendar.previous'),
              next: t('artisanAgenda.calendar.next'),
              today: t('artisanAgenda.calendar.today'),
              agenda: t('artisanAgenda.calendar.agenda'),
              date: t('artisanAgenda.calendar.date'),
              event: t('artisanAgenda.calendar.event'),
              allDay: t('artisanAgenda.calendar.allDay'),
              noEventsInRange: t('artisanAgenda.calendar.noEventsInRange'),
              showMore: (total) => t('artisanAgenda.calendar.showMore').replace('{total}', String(total)),
            }}
            culture={language === 'fr' ? 'fr' : 'en'}
            components={{
              toolbar: (props) => {
                const isCalendarView = props.view === 'month';
                return (
                  <div className="rbc-toolbar">
                    {isCalendarView && (
                      <span className="rbc-btn-group">
                        <button 
                          type="button" 
                          onClick={() => props.onNavigate('TODAY')}
                        >
                          {t('artisanAgenda.calendar.today')}
                        </button>
                        <button 
                          type="button" 
                          onClick={() => props.onNavigate('PREV')}
                        >
                          {t('artisanAgenda.calendar.previous')}
                        </button>
                        <button 
                          type="button" 
                          onClick={() => props.onNavigate('NEXT')}
                        >
                          {t('artisanAgenda.calendar.next')}
                        </button>
                      </span>
                    )}
                    <span className="rbc-toolbar-label"></span>
                    <span className="rbc-btn-group">
                      <button
                        type="button"
                        className={props.view === 'month' ? 'rbc-active' : ''}
                        onClick={() => props.onView('month')}
                      >
                        {t('artisanAgenda.calendar.month')}
                      </button>
                      <button
                        type="button"
                        className={props.view === 'agenda' ? 'rbc-active' : ''}
                        onClick={() => props.onView('agenda')}
                      >
                        {t('artisanAgenda.calendar.agenda')}
                      </button>
                    </span>
                  </div>
                );
              }
            }}
          />
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-4">
          <button
            onClick={() => router.back()}
            className="px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
            disabled={saving}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-brand-700 text-white rounded-lg hover:bg-brand-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Sauvegarde...
              </>
            ) : (
              <>
                💾 Sauvegarder les indisponibilités
              </>
            )}
          </button>
        </div>
      </div>

      {/* Modal d'édition d'événement */}
      {editingEvent && (
        <>
          {/* Overlay transparent pour fermer au clic extérieur */}
          <div 
            className="fixed inset-0 z-40"
            onClick={handleCloseEditModal}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-md w-full p-6 relative animate-slideDown pointer-events-auto">
              {/* Bouton fermer (X) */}
              <button
                onClick={handleCloseEditModal}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
              >
                ×
              </button>

              {editingEvent.isContrat ? (
                // Affichage lecture seule pour les contrats
                <>
                  <h3 className="text-xl font-bold text-red-700 mb-6">
                    🔒 {t('artisanAgenda.editModal.contractTitle')}
                  </h3>

                  <div className="space-y-4 mb-6">
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                      <p className="text-sm text-red-800 mb-2">
                        <strong>{t('artisanAgenda.editModal.contractWarning')}</strong>
                      </p>
                      <p className="text-xs text-red-700">
                        {t('artisanAgenda.editModal.contractNote')}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {t('artisanAgenda.editModal.titleLabel')}
                      </label>
                      <p className="text-lg font-semibold text-slate-900">
                        {editingEvent.title}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {t('artisanAgenda.editModal.dateLabel')}
                      </label>
                      <p className="text-slate-900">
                        {editingEvent.start.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleCloseEditModal}
                    className="w-full px-4 py-3 bg-slate-500 text-white rounded-lg hover:bg-slate-600 font-medium"
                  >
                    {t('artisanAgenda.editModal.closeButton')}
                  </button>
                </>
              ) : (
                // Mode édition normal pour les indisponibilités manuelles
                <>
                  <h3 className="text-xl font-bold text-navy-800 mb-6">
                    ✏️ {t('artisanAgenda.editModal.eventTitle')}
                  </h3>

                  {/* Champ de texte pour renommer */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t('artisanAgenda.editModal.inputLabel')}
                    </label>
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-brand-500 focus:outline-none text-lg"
                      placeholder={t('artisanAgenda.editModal.inputPlaceholder')}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveEdit();
                        }
                      }}
                    />
                  </div>

                  {/* Boutons d'action */}
                  <div className="flex gap-3">
                    {/* Bouton Supprimer avec croix */}
                    <button
                      onClick={handleDeleteEvent}
                      className="flex-1 px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium flex items-center justify-center gap-2"
                    >
                      <span className="text-xl">×</span>
                      {t('artisanAgenda.editModal.deleteButton')}
                    </button>

                    {/* Bouton Enregistrer */}
                    <button
                      onClick={handleSaveEdit}
                      disabled={!editedTitle.trim()}
                      className="flex-1 px-4 py-3 bg-brand-700 text-white rounded-lg hover:bg-brand-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ✓ {t('artisanAgenda.editModal.saveButton')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
