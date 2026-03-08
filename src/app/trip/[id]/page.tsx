"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { useTripDetails } from "@/hooks/useTripDetails";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Plus, MapPin, Plane, Car, Train, Bike, Hotel as HotelIcon, FileText, Calendar, Clock, Users, Phone, RefreshCw, MoreVertical, DollarSign, Pencil, Bell, Trash2 } from "lucide-react";
import { getDB, SyncAction } from "@/lib/db";
import { pushToServer } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";
import { useSyncContext } from "@/hooks/useSync";
import { useNotifications } from "@/hooks/useNotifications";

export default function TripDetailsPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };
  const { user } = useAuth();
  
  type TabId = "itinerary" | "docs" | "travelers" | "expenses";
  const visibleTabs: TabId[] = ["itinerary", "docs", "expenses"];
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [dayPlanMenuOpen, setDayPlanMenuOpen] = useState(false);
  const [travelersPopupOpen, setTravelersPopupOpen] = useState(false);
  const [notifPopupOpen, setNotifPopupOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{ type: "travel" | "place" | "hotel"; id: string } | null>(null);
  const { permission, requestPermission, prefs, setPrefs } = useNotifications();
  const tabMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [tabMenuPosition, setTabMenuPosition] = useState({ top: 0, left: 0 });

  const { trip, travels, places, hotels, idProofs, expenses, loading, addTravel, addPlace, addHotel, updateTravel, updatePlace, updateHotel, removeTraveler, addIdProof, addExpense, deleteTrip, refresh } = useTripDetails(id);
  const syncContext = useSyncContext();

  const [activeTab, setActiveTab] = useState<TabId>("itinerary");
  const [showAddForm, setShowAddForm] = useState<"travel" | "place" | "hotel" | "doc" | "traveler" | "expense" | null>(null);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | "All">("All");

  const isOrg = user?.role === "organizer";

  // Forms State
  const [fDate, setFDate] = useState("");
  const [fDateTo, setFDateTo] = useState("");
  const [fName, setFName] = useState("");
  const [fMode, setFMode] = useState<"bike" | "car" | "train" | "plane">("car");
  const [fDep, setFDep] = useState("");
  const [fArr, setFArr] = useState("");
  const [fOrigin, setFOrigin] = useState("");
  const [fDest, setFDest] = useState("");
  const [fLink, setFLink] = useState("");
  const [fTravelerPhone, setFTravelerPhone] = useState("");
  const [fTravelerName, setFTravelerName] = useState("");
  const [fBookingNeeded, setFBookingNeeded] = useState(false);
  const [fIsBooked, setFIsBooked] = useState(false);
  const [fExpDesc, setFExpDesc] = useState("");
  const [fExpAmount, setFExpAmount] = useState("");
  const [fExpSplit, setFExpSplit] = useState<"equal" | "custom">("equal");
  const [fExpCustomSplits, setFExpCustomSplits] = useState<{ identifier: string; amount: number }[]>([]);

  const resetForm = () => {
    setFDate(""); setFDateTo(""); setFName(""); setFDep(""); setFArr(""); setFOrigin(""); setFDest(""); setFLink(""); setFTravelerPhone(""); setFTravelerName(""); setFBookingNeeded(false); setFIsBooked(false); setFExpDesc(""); setFExpAmount(""); setFExpSplit("equal"); setFExpCustomSplits([]); setShowAddForm(null); setEditingItem(null);
  };
  const startEditItem = (item: any) => {
    setEditingItem({ type: item.type, id: item.id });
    setFDate(item.date?.slice(0, 10) || "");
    setFDateTo(item.dateTo?.slice(0, 10) || "");
    setFBookingNeeded(!!item.bookingNeeded);
    setFIsBooked(!!item.isBooked);
    if (item.type === "travel") {
      setFMode(item.mode || "car");
      setFOrigin(item.origin || "");
      setFDest(item.destination || "");
      const dep = item.departureTime || "";
      const arr = item.arrivalTime || "";
      setFDep(dep.includes("T") ? dep.slice(0, 16) : dep || "");
      setFArr(arr.includes("T") ? arr.slice(0, 16) : arr || "");
    } else if (item.type === "place") {
      setFName(item.name || "");
      setFOrigin(item.location || "");
      setFDest(item.notes || "");
      const vt = item.visitTime || "";
      setFDep(vt.includes("T") ? vt.slice(0, 16) : vt || "");
    } else if (item.type === "hotel") {
      setFName(item.name || "");
      setFOrigin(item.address || "");
      const ci = item.checkInTime || "", co = item.checkOutTime || "";
      setFDep(ci.includes("T") ? ci.slice(0, 16) : ci || "");
      setFArr(co.includes("T") ? co.slice(0, 16) : co || "");
    }
    setShowAddForm(item.type);
  };
  const getDisplayName = (id: string) => (trip?.travelerNames?.[id] || (id.includes("@") ? id.split("@")[0] : id));

  const openTravelersPopup = () => {
    setTravelersPopupOpen(true);
    setTabMenuOpen(false);
  };
  const handleDeleteTrip = async () => {
    if (!confirm("Delete this trip? This cannot be undone.")) return;
    await deleteTrip();
    router.push("/");
  };

  const formatTime = (t: string) => t && t.includes("T") ? new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : t;
  const BookingBadge = ({ item }: { item: { bookingNeeded?: boolean; isBooked?: boolean } }) =>
    item.bookingNeeded != null && item.bookingNeeded ? (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${item.isBooked ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
        {item.isBooked ? "Booked" : "Not Booked"}
      </span>
    ) : null;

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showAddForm === "travel") {
      const dep = fDep.includes("T") ? fDep : (fDate && fDep ? `${fDate}T${fDep.length === 5 ? fDep + ":00" : fDep}` : fDep);
      const arr = fArr.includes("T") ? fArr : ((fDateTo || fDate) && fArr ? `${fDateTo || fDate}T${fArr.length === 5 ? fArr + ":00" : fArr}` : fArr);
      const data = { date: fDate, dateTo: fDateTo || undefined, mode: fMode, departureTime: dep, arrivalTime: arr, origin: fOrigin, destination: fDest, bookingNeeded: fBookingNeeded, isBooked: fIsBooked };
      if (editingItem?.type === "travel") {
        await updateTravel({ ...data, id: editingItem.id, tripId: id });
      } else {
        await addTravel(data);
      }
    } else if (showAddForm === "place") {
      const visitTime = fDep ? (fDep.includes("T") ? fDep : fDate && fDep ? `${fDate}T${fDep}:00` : undefined) : (fDate ? `${fDate}T09:00:00` : undefined);
      const data = { date: fDate, dateTo: fDateTo || undefined, name: fName, location: fOrigin, notes: fDest, visitTime, bookingNeeded: fBookingNeeded, isBooked: fIsBooked };
      if (editingItem?.type === "place") {
        await updatePlace({ ...data, id: editingItem.id, tripId: id } as any);
      } else {
        await addPlace(data);
      }
    } else if (showAddForm === "hotel") {
      const checkIn = fDep ? (fDep.includes("T") ? fDep : fDate && fDep ? `${fDate}T${fDep}:00` : undefined) : undefined;
      const checkOut = fArr ? (fArr.includes("T") ? fArr : (fDateTo || fDate) && fArr ? `${fDateTo || fDate}T${fArr}:00` : undefined) : undefined;
      const data = { date: fDate, dateTo: fDateTo || undefined, name: fName, address: fOrigin, checkInTime: checkIn, checkOutTime: checkOut, bookingNeeded: fBookingNeeded, isBooked: fIsBooked };
      if (editingItem?.type === "hotel") {
        await updateHotel({ ...data, id: editingItem.id, tripId: id } as any);
      } else {
        await addHotel(data);
      }
    } else if (showAddForm === "doc") {
      await addIdProof({ name: fName, link: fLink });
    } else if (showAddForm === "traveler") {
      const phone = normalizePhone(fTravelerPhone);
      if (trip && phone.length >= 10) {
        const existing = (trip.travelerPhones || []).map(normalizePhone);
        if (existing.includes(phone)) {
          alert("This phone number is already added to the trip.");
          resetForm();
          return;
        }
        const db = await getDB();
        if (db) {
          const normalizedPhones = (trip.travelerPhones || []).map(normalizePhone).filter(Boolean);
          const names = { ...(trip.travelerNames || {}), [phone]: (fTravelerName || "").trim() || phone };
          const updatedTrip = { ...trip, travelerPhones: [...new Set([...normalizedPhones, phone])], travelerNames: names };
          await db.put('trips', updatedTrip);

          const action: SyncAction = {
            id: crypto.randomUUID(), type: 'UPDATE', table: 'trips', payload: updatedTrip, timestamp: Date.now()
          };
          const userAction: SyncAction = {
            id: crypto.randomUUID(), type: 'CREATE', table: 'Users' as any, payload: { role: 'user', identifier: phone }, timestamp: Date.now()
          };
          await db.put('syncQueue', action);
          await db.put('syncQueue', userAction);
          try {
            await pushToServer([action, userAction]);
            await db.delete('syncQueue', action.id);
            await db.delete('syncQueue', userAction.id);
          } catch {}
          refresh();
        }
      }
    } else if (showAddForm === "expense" && trip) {
      const amount = parseFloat(fExpAmount);
      if (!fExpDesc || isNaN(amount) || amount <= 0) return;
      const participants = [trip.createdBy, ...(trip.travelerPhones || [])];
      let splits: { identifier: string; amount: number }[];
      if (fExpSplit === "equal") {
        const each = Math.round((amount / participants.length) * 100) / 100;
        splits = participants.map(id => ({ identifier: id, amount: each }));
      } else {
        const customSum = participants.reduce((s, _, i) => s + (fExpCustomSplits[i]?.amount || 0), 0);
        if (Math.abs(customSum - amount) >= 0.02) return;
        splits = fExpCustomSplits.filter(s => s.identifier && s.amount > 0);
        if (splits.length === 0) splits = participants.map(id => ({ identifier: id, amount: Math.round((amount / participants.length) * 100) / 100 }));
      }
      const addedBy = user?.role === "organizer" ? (user.username || user.id || "") : normalizePhone(user?.phoneNumber || "");
      await addExpense({ addedBy, description: fExpDesc, amount, currency: "INR", splitType: fExpSplit, splits, date: fDate || undefined });
    }
    resetForm();
  };

  // Group Itinerary by Date
  const itineraryItems = useMemo(() => {
    const items: any[] = [];
    travels.forEach(t => items.push({ ...t, type: 'travel' }));
    places.forEach(p => items.push({ ...p, type: 'place' }));
    hotels.forEach(h => items.push({ ...h, type: 'hotel' }));
    
    // Group by Date
    const grouped: Record<string, any[]> = {};
    items.forEach(item => {
      // Some items might not have a date directly (if corrupted), fallback safely
      const d = item.date || "Unknown";
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(item);
    });

    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a,b) => {
        const timeA = a.type === 'travel' ? a.departureTime : a.type === 'hotel' ? a.checkInTime || "12:00" : "09:00";
        const timeB = b.type === 'travel' ? b.departureTime : b.type === 'hotel' ? b.checkInTime || "12:00" : "09:00";
        return timeA.localeCompare(timeB);
      });
    });

    return grouped;
  }, [travels, places, hotels]);

  const allTripDates = useMemo(() => {
    if (!trip) return [];
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    const out: string[] = [];
    const d = new Date(start);
    while (d <= end) {
      out.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [trip?.startDate, trip?.endDate]);
  const initialDateSet = useRef(false);
  useEffect(() => {
    if (allTripDates.length > 0 && !initialDateSet.current) {
      setSelectedDateFilter(allTripDates[0]);
      initialDateSet.current = true;
    }
  }, [allTripDates]);
  useEffect(() => {
    if (selectedDateFilter === "All") setDayPlanMenuOpen(false);
  }, [selectedDateFilter]);
  useEffect(() => {
    if (tabMenuOpen && tabMenuButtonRef.current && typeof document !== "undefined") {
      const rect = tabMenuButtonRef.current.getBoundingClientRect();
      setTabMenuPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 180) });
    }
  }, [tabMenuOpen]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading trip...</div>;
  if (!trip) return <div className="p-8 text-center text-gray-500">Trip not found</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-blue-600 text-white shadow-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/")} className="p-1 hover:bg-blue-700 rounded-full" aria-label="Back">
              <ArrowLeft className="h-6 w-6" />
            </button>
            <button
              onClick={() => syncContext?.sync()}
              disabled={syncContext?.isSyncing}
              className="p-1 hover:bg-blue-700 rounded-full disabled:opacity-70 disabled:cursor-not-allowed"
              aria-label="Sync"
              title="Refresh from server"
            >
              {syncContext?.isSyncing ? (
                <div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <RefreshCw className="h-6 w-6" />
              )}
            </button>
            <div>
              <h1 className="text-xl font-bold leading-tight">{trip.name}</h1>
              <span className="text-xs text-blue-100 opacity-90">
                {new Date(trip.startDate).toLocaleDateString()} - {new Date(trip.endDate).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto flex items-center">
          <div className="flex-1 overflow-x-auto hide-scrollbar min-w-0">
            <div className="flex min-w-max">
              {visibleTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-4 px-6 text-sm font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${
                    activeTab === tab ? "text-blue-700 border-b-2 border-blue-700 bg-blue-50/50" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {tab === "docs" ? "ID Proofs" : tab === "expenses" ? "Expenses" : tab === "itinerary" ? "Itinerary" : tab}
                </button>
              ))}
            </div>
          </div>
          <div className="relative flex-shrink-0 pl-2 py-2 border-l border-gray-200">
            <button ref={tabMenuButtonRef} onClick={() => { const open = !tabMenuOpen; if (open && tabMenuButtonRef.current) { const rect = tabMenuButtonRef.current.getBoundingClientRect(); setTabMenuPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 200) }); } setTabMenuOpen(open); }} className="p-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="More options" aria-expanded={tabMenuOpen}>
              <MoreVertical className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
        {tabMenuOpen && typeof document !== "undefined" && createPortal(
              <>
                <div className="fixed inset-0 z-10" onClick={() => setTabMenuOpen(false)} aria-hidden="true" />
                <div className="fixed z-20 py-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px]" style={{ top: tabMenuPosition.top, left: tabMenuPosition.left }}>
                  <button type="button" onClick={openTravelersPopup} className="w-full text-left px-3 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50 flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-500" />
                    Travelers
                  </button>
                  <button type="button" onClick={() => { setTabMenuOpen(false); setNotifPopupOpen(true); }} className="w-full text-left px-3 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50 flex items-center gap-2">
                    <Bell className="h-4 w-4 text-gray-500" />
                    Notifications
                  </button>
                  {isOrg && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button type="button" onClick={() => { setTabMenuOpen(false); handleDeleteTrip(); }} className="w-full text-left px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Delete trip</button>
                    </>
                  )}
                </div>
              </>,
              document.body
            )}
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* ADD ACTION BUTTONS - docs/travelers only; itinerary uses date Edit button below */}
        {isOrg && !showAddForm && (
          <div className="flex gap-2 overflow-x-auto pb-4 hide-scrollbar">
            {activeTab === "docs" && (
              <button onClick={() => setShowAddForm('doc')} className="flex whitespace-nowrap items-center gap-2 bg-orange-100 text-orange-800 px-4 py-2 rounded-full text-sm font-bold">
                <Plus className="h-4 w-4"/> Add ID Proof
              </button>
            )}
            {activeTab === "expenses" && (
              <button onClick={() => setShowAddForm('expense')} className="flex whitespace-nowrap items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-bold">
                <DollarSign className="h-4 w-4"/> Add Expense
              </button>
            )}
          </div>
        )}

        {/* ADD FORMS */}
        {showAddForm && (
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm mb-6 animate-in fade-in slide-in-from-top-4">
            <h3 className="font-bold text-gray-800 mb-4">{editingItem ? `Edit ${showAddForm}` : `Add ${showAddForm}`}</h3>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              {(showAddForm === 'travel' || showAddForm === 'place' || showAddForm === 'hotel') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900">From Date</label>
                    <input type="date" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fDate} onChange={e=>setFDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">To Date <span className="text-gray-500 font-normal">(optional)</span></label>
                    <input type="date" className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fDateTo} onChange={e=>setFDateTo(e.target.value)} />
                  </div>
                </div>
              )}
              
              {showAddForm === 'doc' && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Document Name</label>
                    <input type="text" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fName} onChange={e=>setFName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Link / URL</label>
                    <input type="url" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fLink} onChange={e=>setFLink(e.target.value)} />
                  </div>
                </>
              )}

              {showAddForm === 'traveler' && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Traveler Phone Number</label>
                    <input type="tel" required placeholder="e.g. 1234567890" minLength={10} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-gray-400" value={fTravelerPhone} onChange={e=>setFTravelerPhone(e.target.value.replace(/\D/g, ''))} />
                    <p className="text-xs text-gray-600 mt-2 font-medium">Must be 10+ digits. The traveler logs in with this same number to see the trip.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Name <span className="text-gray-500 font-normal">(for display in expenses)</span></label>
                    <input type="text" placeholder="e.g. John" className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-gray-400" value={fTravelerName} onChange={e=>setFTravelerName(e.target.value)} />
                  </div>
                </>
              )}

              {showAddForm === 'expense' && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Date</label>
                    <input type="date" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fDate} onChange={e=>setFDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Description</label>
                    <input type="text" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fExpDesc} onChange={e=>setFExpDesc(e.target.value)} placeholder="e.g. Dinner at beach" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Amount</label>
                    <input type="number" required min="0.01" step="0.01" className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fExpAmount} onChange={e=>setFExpAmount(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Split</label>
                    <select className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fExpSplit} onChange={e=>setFExpSplit(e.target.value as "equal" | "custom")}>
                      <option value="equal">Split equally</option>
                      <option value="custom">Custom split</option>
                    </select>
                  </div>
                  {fExpSplit === "custom" && trip && (() => {
                    const participants = [trip.createdBy, ...(trip.travelerPhones || [])];
                    const totalAmount = parseFloat(fExpAmount) || 0;
                    const customSum = participants.reduce((sum, _, i) => sum + (fExpCustomSplits[i]?.amount || 0), 0);
                    const remaining = Math.round((totalAmount - customSum) * 100) / 100;
                    const matches = totalAmount > 0 && Math.abs(remaining) < 0.02;
                    return (
                      <div className="space-y-2">
                        <label className="block text-sm font-bold text-gray-900">Amount per person</label>
                        {participants.map((id, i) => (
                          <div key={i} className="flex gap-2 items-center">
                            <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{getDisplayName(id)}</span>
                            <input type="number" min="0" step="0.01" placeholder="0" className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 bg-white" value={fExpCustomSplits[i] === undefined ? "" : fExpCustomSplits[i].amount} onChange={e=>{ const v = parseFloat(e.target.value); setFExpCustomSplits(prev => { const n = [...prev]; n[i] = { identifier: id, amount: isNaN(v) ? 0 : v }; return n; }); }} />
                          </div>
                        ))}
                        <div className={`mt-2 text-sm font-medium ${matches ? "text-green-700" : "text-red-600"}`}>
                          Split total: {customSum.toFixed(2)} / Amount: {totalAmount.toFixed(2)}
                          {!matches && totalAmount > 0 && (
                            <>
                              <span className="block mt-1">Remaining: {remaining.toFixed(2)} — amounts must match to submit</span>
                              {remaining > 0 && (
                                <button type="button" onClick={() => { const idx = participants.findIndex((_, i) => fExpCustomSplits[i] === undefined); if (idx >= 0) setFExpCustomSplits(prev => { const n = [...prev]; n[idx] = { identifier: participants[idx], amount: Math.round(remaining * 100) / 100 }; return n; }); }} className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-700 underline">Fill remaining for next empty</button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {showAddForm === 'travel' && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Mode</label>
                    <select className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fMode} onChange={e=>setFMode(e.target.value as any)}>
                      <option value="plane">Flight</option>
                      <option value="train">Train</option>
                      <option value="car">Car</option>
                      <option value="bike">Bike</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-900">Origin</label>
                      <input type="text" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fOrigin} onChange={e=>setFOrigin(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-900">Destination</label>
                      <input type="text" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fDest} onChange={e=>setFDest(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-900">Departure (date & time)</label>
                      <input type="datetime-local" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fDate && fDep ? (fDep.includes("T") ? fDep : `${fDate}T${fDep}`) : ""} onChange={e=>{ const v = e.target.value; setFDep(v); if (v) setFDate(v.slice(0,10)); }} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-900">Arrival (date & time)</label>
                      <input type="datetime-local" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={(fDateTo || fDate) && fArr ? (fArr.includes("T") ? fArr : `${fDateTo || fDate}T${fArr}`) : ""} onChange={e=>{ const v = e.target.value; setFArr(v); if (v) setFDateTo(v.slice(0,10)); }} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 items-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={fBookingNeeded} onChange={e=>setFBookingNeeded(e.target.checked)} className="rounded border-gray-300" />
                      <span className="text-sm font-bold text-gray-900">Booking needed?</span>
                    </label>
                    {fBookingNeeded && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={fIsBooked} onChange={e=>setFIsBooked(e.target.checked)} className="rounded border-gray-300" />
                        <span className="text-sm font-bold text-gray-900">Booked</span>
                      </label>
                    )}
                  </div>
                </>
              )}

              {showAddForm === 'place' && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Place Name</label>
                    <input type="text" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fName} onChange={e=>setFName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Visit (date & time)</label>
                    <input type="datetime-local" className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fDate && fDep ? (fDep.includes("T") ? fDep : `${fDate}T${fDep}`) : ""} onChange={e=>{ const v = e.target.value; setFDep(v); if (v) setFDate(v.slice(0,10)); }} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Location <span className="text-gray-500 font-medium">(Optional)</span></label>
                    <input type="text" className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fOrigin} onChange={e=>setFOrigin(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Notes <span className="text-gray-500 font-medium">(Optional)</span></label>
                    <textarea className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" rows={2} value={fDest} onChange={e=>setFDest(e.target.value)} />
                  </div>
                  <div className="flex flex-wrap gap-4 items-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={fBookingNeeded} onChange={e=>setFBookingNeeded(e.target.checked)} className="rounded border-gray-300" />
                      <span className="text-sm font-bold text-gray-900">Booking needed?</span>
                    </label>
                    {fBookingNeeded && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={fIsBooked} onChange={e=>setFIsBooked(e.target.checked)} className="rounded border-gray-300" />
                        <span className="text-sm font-bold text-gray-900">Booked</span>
                      </label>
                    )}
                  </div>
                </>
              )}

              {showAddForm === 'hotel' && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Hotel Name</label>
                    <input type="text" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fName} onChange={e=>setFName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Address <span className="text-gray-500 font-medium">(Optional)</span></label>
                    <input type="text" className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fOrigin} onChange={e=>setFOrigin(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-900">Check-In (date & time)</label>
                      <input type="datetime-local" className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fDate && fDep ? (fDep.includes("T") ? fDep : `${fDate}T${fDep}`) : ""} onChange={e=>{ const v = e.target.value; setFDep(v); if (v) setFDate(v.slice(0,10)); }} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-900">Check-Out (date & time)</label>
                      <input type="datetime-local" className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={(fDateTo || fDate) && fArr ? (fArr.includes("T") ? fArr : `${fDateTo || fDate}T${fArr}`) : ""} onChange={e=>{ const v = e.target.value; setFArr(v); if (v) setFDateTo(v.slice(0,10)); }} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 items-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={fBookingNeeded} onChange={e=>setFBookingNeeded(e.target.checked)} className="rounded border-gray-300" />
                      <span className="text-sm font-bold text-gray-900">Booking needed?</span>
                    </label>
                    {fBookingNeeded && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={fIsBooked} onChange={e=>setFIsBooked(e.target.checked)} className="rounded border-gray-300" />
                        <span className="text-sm font-bold text-gray-900">Booked</span>
                      </label>
                    )}
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
                <button
                  type="submit"
                  disabled={showAddForm === "expense" && fExpSplit === "custom" && trip ? (() => {
                    const amt = parseFloat(fExpAmount) || 0;
                    const participants = [trip.createdBy, ...(trip.travelerPhones || [])];
                    const sum = participants.reduce((s, _, i) => s + (fExpCustomSplits[i]?.amount || 0), 0);
                    return amt <= 0 || Math.abs(sum - amt) >= 0.02;
                  })() : false}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB CONTENT: ITINERARY */}
        {activeTab === "itinerary" && (
          <div className="space-y-6">
            {/* Date Filter Chips - always show when we have trip dates (even if itinerary empty) */}
            {allTripDates.length > 0 && (
              <>
                <div className="flex gap-2 overflow-x-auto pb-4 pt-2 hide-scrollbar flex-nowrap">
                  <button
                    onClick={() => setSelectedDateFilter("All")}
                    className={`flex-shrink-0 whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-bold transition-all shadow-sm ${
                      selectedDateFilter === "All" ? "bg-gray-900 text-white shadow-md border border-gray-900" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                    }`}
                  >
                    All Days
                  </button>
                  {allTripDates.map(date => (
                    <button
                      key={date}
                      onClick={() => setSelectedDateFilter(date)}
                      className={`flex-shrink-0 whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-bold transition-all shadow-sm flex items-center gap-2 ${
                        selectedDateFilter === date ? "bg-blue-600 text-white shadow-md border border-blue-600" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                      }`}
                    >
                      <Calendar className="h-4 w-4 opacity-80" />
                      {new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </button>
                  ))}
                </div>

                {/* Plan this day - single entry when a date is selected (organizer only) */}
                {isOrg && !showAddForm && selectedDateFilter !== "All" && (
                  <div className="relative flex justify-end -mt-2 pb-2">
                    <button
                      onClick={() => setDayPlanMenuOpen((o) => !o)}
                      className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-full text-sm font-bold shadow-md hover:bg-blue-700 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                      Plan this day
                    </button>
                    {dayPlanMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setDayPlanMenuOpen(false)} aria-hidden="true" />
                        <div className="absolute right-0 top-full mt-2 z-20 bg-white rounded-xl shadow-lg border border-gray-200 py-2 min-w-[180px]">
                          <button onClick={() => { setFDate(selectedDateFilter); setShowAddForm('travel'); setDayPlanMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-bold text-blue-700 hover:bg-blue-50">
                            <Plane className="h-4 w-4" /> Add Travel
                          </button>
                          <button onClick={() => { setFDate(selectedDateFilter); setShowAddForm('hotel'); setDayPlanMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-bold text-indigo-700 hover:bg-indigo-50">
                            <HotelIcon className="h-4 w-4" /> Add Hotel
                          </button>
                          <button onClick={() => { setFDate(selectedDateFilter); setShowAddForm('place'); setDayPlanMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-bold text-emerald-700 hover:bg-emerald-50">
                            <MapPin className="h-4 w-4" /> Add Place
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {Object.keys(itineraryItems).length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 flex flex-col items-center justify-center text-center mt-4">
                 <Calendar className="h-12 w-12 text-gray-300 mb-4" />
                 <p className="text-gray-500 font-bold text-lg">No itinerary planned yet.</p>
                 {allTripDates.length > 0 && isOrg && selectedDateFilter !== "All" && (
                   <p className="text-gray-400 text-sm mt-2">Select a date above and use &quot;Plan this day&quot; to add travel, hotel or place.</p>
                 )}
              </div>
            ) : (
              <>
                {/* Day Cards */}
                <div className="space-y-8 mt-2">
                  {(selectedDateFilter === "All" ? Object.entries(itineraryItems) : [[selectedDateFilter, itineraryItems[selectedDateFilter] || []]] as [string, any[]][])
                    .sort(([dateA], [dateB]) => String(dateA).localeCompare(String(dateB)))
                    .map(([date, items]: [string, any[]]) => (
                      <div key={date} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        
                        {/* Day Card Header */}
                        <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4 flex items-center justify-between border-b border-gray-200">
                          <h2 className="text-xl font-extrabold text-white flex items-center gap-3 tracking-wide">
                            <div className="p-2 bg-white/20 rounded-lg"><Calendar className="h-5 w-5 text-white" /></div>
                            {new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                          </h2>
                          <span className="text-white/80 font-bold text-sm bg-black/20 px-3 py-1 rounded-full">
                            {items.length} {items.length === 1 ? 'Activity' : 'Activities'}
                          </span>
                        </div>

                        {/* Day Card Body */}
                        <div className="p-6">
                          <div className="relative border-l-2 border-gray-100 ml-4 space-y-8">
                            {items.map((item: any, idx: number) => (
                              <div key={idx} className="relative pl-8 group">
                                <div className="absolute -left-[5px] top-6 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white shadow-sm" />
                                
                                {item.type === 'travel' ? (
                                  <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100 hover:border-blue-300 hover:shadow-md transition-all">
                                    <div className="flex items-center justify-between gap-3 mb-3">
                                      <div className="flex items-center gap-3 font-extrabold text-gray-900 text-lg flex-wrap">
                                        <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
                                          {item.mode === 'plane' || item.mode === 'flight' ? <Plane className="h-5 w-5" /> : 
                                           item.mode === 'car' ? <Car className="h-5 w-5" /> :
                                           item.mode === 'train' ? <Train className="h-5 w-5" /> :
                                           <Bike className="h-5 w-5" />}
                                        </div>
                                        <span>{item.origin} &rarr; {item.destination}</span>
                                        <BookingBadge item={item} />
                                      </div>
                                      {isOrg && (
                                        <button type="button" onClick={() => startEditItem(item)} className="p-2 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200" aria-label="Edit">
                                          <Pencil className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-6 mt-2 ml-1">
                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Departure</span>
                                          <div className="flex items-center gap-1.5 font-bold text-gray-900 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm"><Clock className="h-4 w-4 text-blue-600"/> {formatTime(item.departureTime)}</div>
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Arrival</span>
                                          <div className="flex items-center gap-1.5 font-bold text-gray-900 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm"><Clock className="h-4 w-4 text-emerald-600"/> {formatTime(item.arrivalTime)}</div>
                                        </div>
                                    </div>
                                  </div>
                                ) : item.type === 'place' ? (
                                  <div className="bg-gray-50/80 p-5 rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-md transition-all">
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                      <div className="flex items-center gap-3 font-extrabold text-gray-900 text-lg flex-wrap">
                                        <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
                                          <MapPin className="h-5 w-5" />
                                        </div>
                                        <span>{item.name}</span>
                                        <BookingBadge item={item} />
                                      </div>
                                      {isOrg && (
                                        <button type="button" onClick={() => startEditItem(item)} className="p-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200" aria-label="Edit">
                                          <Pencil className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                    {item.location && (
                                      <div className="flex items-start gap-2 ml-1 mt-3">
                                        <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                                        <p className="text-sm font-bold text-gray-600 leading-relaxed">{item.location}</p>
                                      </div>
                                    )}
                                    {item.notes && (
                                      <div className="mt-4 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                        <p className="text-sm font-bold text-gray-700 italic leading-relaxed whitespace-pre-line">{item.notes}</p>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="bg-indigo-50/40 p-5 rounded-xl border border-indigo-100 hover:border-indigo-300 hover:shadow-md transition-all">
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                      <div className="flex items-center gap-3 font-extrabold text-gray-900 text-lg flex-wrap">
                                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
                                          <HotelIcon className="h-5 w-5" />
                                        </div>
                                        <span>{item.name}</span>
                                        <BookingBadge item={item} />
                                      </div>
                                      {isOrg && (
                                        <button type="button" onClick={() => startEditItem(item)} className="p-2 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200" aria-label="Edit">
                                          <Pencil className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                    {item.address && (
                                      <div className="flex items-start gap-2 ml-1 mt-3">
                                        <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                                        <p className="text-sm font-bold text-gray-600 leading-relaxed">{item.address}</p>
                                      </div>
                                    )}
                                    {(item.checkInTime || item.checkOutTime) && (
                                      <div className="flex flex-wrap items-center gap-6 mt-4 ml-1">
                                          {item.checkInTime && (
                                            <div className="flex flex-col">
                                              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Check-in</span>
                                              <div className="flex items-center gap-1.5 font-bold text-gray-900 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm"><Clock className="h-4 w-4 text-indigo-600"/> {formatTime(item.checkInTime)}</div>
                                            </div>
                                          )}
                                          {item.checkOutTime && (
                                            <div className="flex flex-col">
                                              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Check-out</span>
                                              <div className="flex items-center gap-1.5 font-bold text-gray-900 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm"><Clock className="h-4 w-4 text-orange-600"/> {formatTime(item.checkOutTime)}</div>
                                            </div>
                                          )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB CONTENT: ID PROOFS */}
        {activeTab === "docs" && (
          <div className="grid gap-4">
            {idProofs.length === 0 ? (
              <p className="text-gray-600 font-medium text-center py-10">No documents added yet.</p>
            ) : (
              idProofs.map(doc => (
                <a key={doc.id} href={doc.link} target="_blank" rel="noopener noreferrer" className="block p-4 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-orange-100 rounded-lg text-orange-700 group-hover:bg-orange-200 transition-colors">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">{doc.name}</h3>
                      <p className="text-sm font-bold text-blue-700 mt-1">View Document &rarr;</p>
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        )}

        {/* TAB CONTENT: EXPENSES */}
        {activeTab === "expenses" && (
          <div className="grid gap-4">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-2 border-b border-gray-100 pb-2 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" /> Expenses
              </h3>
              {expenses.length === 0 ? (
                <p className="text-gray-600 font-medium mt-4">No expenses yet. Add one to split costs.</p>
              ) : (
                <div className="space-y-4 mt-4">
                  {expenses.map((ex) => (
                    <div key={ex.id} className="p-5 rounded-xl border border-gray-200 bg-white shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-gray-900 text-lg">{ex.description}</p>
                          <p className="text-sm font-medium text-gray-600 mt-1">
                            {ex.date ? new Date(ex.date).toLocaleDateString(undefined, { dateStyle: "medium" }) + " · " : ""}
                            Added by {ex.addedBy} · {ex.currency} {ex.amount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Split per person</p>
                        <div className="flex flex-wrap gap-2">
                          {ex.splits.map((s, i) => (
                            <span key={i} className="text-sm font-semibold text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">{getDisplayName(s.identifier)}: {s.amount.toFixed(2)}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* Popup for Travelers from 3-dot menu */}
      {travelersPopupOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/50" onClick={() => setTravelersPopupOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900">Travelers</h2>
              <button type="button" onClick={() => setTravelersPopupOpen(false)} className="p-2 rounded-full hover:bg-gray-200 text-gray-600 text-xl leading-none" aria-label="Close">
                ×
              </button>
            </div>
            <div className="overflow-y-auto p-5 flex-1">
              {trip && (
                <>
                  {isOrg && (
                    <button onClick={() => { setShowAddForm("traveler"); setTravelersPopupOpen(false); }} className="mb-4 flex items-center gap-2 bg-purple-100 text-purple-800 px-4 py-2 rounded-full text-sm font-bold">
                      <Plus className="h-4 w-4"/> Invite Traveler
                    </button>
                  )}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-900 mb-2 border-b border-gray-100 pb-2">Organizer</h3>
                    <div className="flex items-center gap-3 mt-4">
                      <div className="p-2 bg-blue-100 text-blue-800 rounded-full"><Users className="h-5 w-5"/></div>
                      <span className="font-bold text-gray-900">{trip.createdBy}</span>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mt-3">
                    <h3 className="font-bold text-gray-900 mb-2 border-b border-gray-100 pb-2">Invited Travelers</h3>
                    {!trip.travelerPhones || trip.travelerPhones.length === 0 ? (
                      <p className="text-gray-600 font-medium mt-4">No travelers added to this trip yet.</p>
                    ) : (
                      <div className="space-y-4 mt-4">
                        {trip.travelerPhones.map((phone, i) => (
                          <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-gray-100 text-gray-700 rounded-full"><Phone className="h-5 w-5"/></div>
                              <span className="font-bold text-gray-900 text-lg tracking-wide">{getDisplayName(phone)}</span>
                              {trip.travelerNames?.[phone] && <span className="text-sm text-gray-500">({phone})</span>}
                            </div>
                            {isOrg && (
                              <button type="button" onClick={() => { if (confirm(`Remove ${getDisplayName(phone)} from this trip?`)) removeTraveler(phone); }} className="p-2 rounded-lg text-red-600 hover:bg-red-50" aria-label="Remove traveler">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Popup for Notifications from 3-dot menu */}
      {notifPopupOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/50" onClick={() => setNotifPopupOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-600" />
                Notification settings
              </h2>
              <button type="button" onClick={() => setNotifPopupOpen(false)} className="p-2 rounded-full hover:bg-gray-200 text-gray-600 text-xl leading-none" aria-label="Close">
                ×
              </button>
            </div>
            <div className="p-5 space-y-5">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-100">
                <input type="checkbox" checked={prefs.enabled} onChange={e=>setPrefs(p=>({...p, enabled: e.target.checked}))} className="rounded border-gray-400 w-4 h-4" />
                <span className="text-sm font-bold text-gray-900">Enable reminders</span>
              </label>
              {prefs.enabled && permission === "granted" && (
                <>
                  <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                    <label className="block text-sm font-bold text-gray-900 mb-2">Notify me</label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={1} max={24} value={prefs.hoursBefore} onChange={e=>{ const v = parseInt(e.target.value, 10); if (!isNaN(v)) setPrefs(p=>({...p, hoursBefore: Math.max(1, Math.min(24, v))})); }} className="w-16 px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-bold text-gray-900 bg-white" />
                      <span className="text-sm font-bold text-gray-900">hours before event</span>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                    <p className="text-sm font-bold text-gray-900 mb-3">Notify me for</p>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer py-1"><input type="checkbox" checked={prefs.travel} onChange={e=>setPrefs(p=>({...p, travel: e.target.checked}))} className="rounded border-gray-400 w-4 h-4" /><span className="text-sm font-bold text-gray-900">Travel</span></label>
                      <label className="flex items-center gap-3 cursor-pointer py-1"><input type="checkbox" checked={prefs.hotel} onChange={e=>setPrefs(p=>({...p, hotel: e.target.checked}))} className="rounded border-gray-400 w-4 h-4" /><span className="text-sm font-bold text-gray-900">Hotel check-in</span></label>
                      <label className="flex items-center gap-3 cursor-pointer py-1"><input type="checkbox" checked={prefs.place} onChange={e=>setPrefs(p=>({...p, place: e.target.checked}))} className="rounded border-gray-400 w-4 h-4" /><span className="text-sm font-bold text-gray-900">Places to visit</span></label>
                    </div>
                  </div>
                </>
              )}
              {prefs.enabled && permission !== "granted" && (
                <button onClick={() => { requestPermission(); setNotifPopupOpen(false); }} className="w-full bg-blue-600 text-white px-4 py-2.5 text-sm font-bold rounded-lg hover:bg-blue-700">
                  Turn on notifications
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
