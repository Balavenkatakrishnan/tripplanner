"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTripDetails } from "@/hooks/useTripDetails";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Plus, MapPin, Plane, Car, Train, Bike, Hotel as HotelIcon, FileText, Calendar, Clock, Users, Phone, RefreshCw } from "lucide-react";
import { getDB, SyncAction } from "@/lib/db";
import { pushToServer } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";
import { useSyncContext } from "@/hooks/useSync";

export default function TripDetailsPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };
  const { user } = useAuth();
  
  const { trip, travels, places, hotels, idProofs, loading, addTravel, addPlace, addHotel, addIdProof, refresh } = useTripDetails(id);
  const syncContext = useSyncContext();

  const [activeTab, setActiveTab] = useState<"itinerary" | "docs" | "travelers">("itinerary");
  const [showAddForm, setShowAddForm] = useState<"travel" | "place" | "hotel" | "doc" | "traveler" | null>(null);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | "All">("All");

  const isOrg = user?.role === "organizer";

  // Forms State
  const [fDate, setFDate] = useState("");
  const [fName, setFName] = useState("");
  const [fMode, setFMode] = useState<"bike" | "car" | "train" | "plane">("car");
  const [fDep, setFDep] = useState("");
  const [fArr, setFArr] = useState("");
  const [fOrigin, setFOrigin] = useState("");
  const [fDest, setFDest] = useState("");
  const [fLink, setFLink] = useState("");
  const [fTravelerPhone, setFTravelerPhone] = useState("");

  const resetForm = () => {
    setFDate(""); setFName(""); setFDep(""); setFArr(""); setFOrigin(""); setFDest(""); setFLink(""); setFTravelerPhone(""); setShowAddForm(null);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showAddForm === "travel") {
      await addTravel({ date: fDate, mode: fMode, departureTime: fDep, arrivalTime: fArr, origin: fOrigin, destination: fDest });
    } else if (showAddForm === "place") {
      await addPlace({ date: fDate, name: fName, location: fOrigin, notes: fDest });
    } else if (showAddForm === "hotel") {
      await addHotel({ date: fDate, name: fName, address: fOrigin, checkInTime: fDep, checkOutTime: fArr });
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
          const updatedTrip = { ...trip, travelerPhones: [...new Set([...normalizedPhones, phone])] };
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
      <div className="bg-white border-b border-gray-200 overflow-x-auto hide-scrollbar">
        <div className="max-w-3xl mx-auto flex min-w-max">
          {["itinerary", "docs", "travelers"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`flex-1 py-4 px-6 text-sm font-bold uppercase tracking-wide transition-colors ${
                activeTab === tab ? "text-blue-700 border-b-2 border-blue-700 bg-blue-50/50" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {tab === "docs" ? "ID Proofs" : tab}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* ADD ACTION BUTTONS FOR ORGANIZER */}
        {isOrg && !showAddForm && (
          <div className="flex gap-2 overflow-x-auto pb-4 hide-scrollbar">
            {activeTab === "itinerary" && (
              <>
                <button onClick={() => setShowAddForm('travel')} className="flex whitespace-nowrap items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-bold shadow-sm hover:bg-blue-200 transition-colors">
                  <Plus className="h-4 w-4"/> Add Travel
                </button>
                <button onClick={() => setShowAddForm('hotel')} className="flex whitespace-nowrap items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full text-sm font-bold shadow-sm hover:bg-indigo-200 transition-colors">
                  <Plus className="h-4 w-4"/> Add Hotel
                </button>
                <button onClick={() => setShowAddForm('place')} className="flex whitespace-nowrap items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-sm font-bold shadow-sm hover:bg-emerald-200 transition-colors">
                  <Plus className="h-4 w-4"/> Add Place
                </button>
              </>
            )}
            {activeTab === "docs" && (
              <button onClick={() => setShowAddForm('doc')} className="flex whitespace-nowrap items-center gap-2 bg-orange-100 text-orange-800 px-4 py-2 rounded-full text-sm font-bold">
                <Plus className="h-4 w-4"/> Add ID Proof
              </button>
            )}
            {activeTab === "travelers" && (
              <button onClick={() => setShowAddForm('traveler')} className="flex whitespace-nowrap items-center gap-2 bg-purple-100 text-purple-800 px-4 py-2 rounded-full text-sm font-bold">
                <Plus className="h-4 w-4"/> Invite Traveler
              </button>
            )}
          </div>
        )}

        {/* ADD FORMS */}
        {showAddForm && (
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm mb-6 animate-in fade-in slide-in-from-top-4">
            <h3 className="font-bold text-gray-800 mb-4 capitalize">Add {showAddForm}</h3>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              {showAddForm !== 'doc' && showAddForm !== 'traveler' && (
                <div>
                  <label className="block text-sm font-bold text-gray-900">Date</label>
                  <input type="date" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fDate} onChange={e=>setFDate(e.target.value)} />
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
                <div>
                  <label className="block text-sm font-bold text-gray-900">Traveler Phone Number</label>
                  <input type="tel" required placeholder="e.g. 1234567890" minLength={10} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-gray-400" value={fTravelerPhone} onChange={e=>setFTravelerPhone(e.target.value.replace(/\D/g, ''))} />
                  <p className="text-xs text-gray-600 mt-2 font-medium">Must be 10+ digits. The traveler logs in with this same number to see the trip.</p>
                </div>
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
                      <label className="block text-sm font-bold text-gray-900">Departure Time</label>
                      <input type="time" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fDep} onChange={e=>setFDep(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-900">Arrival Time</label>
                      <input type="time" required className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fArr} onChange={e=>setFArr(e.target.value)} />
                    </div>
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
                    <label className="block text-sm font-bold text-gray-900">Location <span className="text-gray-500 font-medium">(Optional)</span></label>
                    <input type="text" className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fOrigin} onChange={e=>setFOrigin(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900">Notes <span className="text-gray-500 font-medium">(Optional)</span></label>
                    <textarea className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" rows={2} value={fDest} onChange={e=>setFDest(e.target.value)} />
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
                      <label className="block text-sm font-bold text-gray-900">Check-In</label>
                      <input type="time" className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fDep} onChange={e=>setFDep(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-900">Check-Out</label>
                      <input type="time" className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={fArr} onChange={e=>setFArr(e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        )}

        {/* TAB CONTENT: ITINERARY */}
        {activeTab === "itinerary" && (
          <div className="space-y-6">
            {Object.keys(itineraryItems).length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 flex flex-col items-center justify-center text-center mt-4">
                 <Calendar className="h-12 w-12 text-gray-300 mb-4" />
                 <p className="text-gray-500 font-bold text-lg">No itinerary planned yet.</p>
              </div>
            ) : (
              <>
                {/* Date Filter Chips */}
                <div className="flex gap-2 overflow-x-auto pb-4 pt-2 hide-scrollbar">
                  <button
                    onClick={() => setSelectedDateFilter("All")}
                    className={`whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-bold transition-all shadow-sm ${
                      selectedDateFilter === "All" ? "bg-gray-900 text-white shadow-md border border-gray-900" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                    }`}
                  >
                    All Days
                  </button>
                  {Object.keys(itineraryItems)
                    .sort((a,b) => a.localeCompare(b))
                    .map(date => (
                    <button
                      key={date}
                      onClick={() => setSelectedDateFilter(date)}
                      className={`whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-bold transition-all shadow-sm flex items-center gap-2 ${
                        selectedDateFilter === date ? "bg-blue-600 text-white shadow-md border border-blue-600" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                      }`}
                    >
                      <Calendar className="h-4 w-4 opacity-80" />
                      {new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </button>
                  ))}
                </div>

                {/* Day Cards */}
                <div className="space-y-8 mt-2">
                  {Object.entries(itineraryItems)
                    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
                    .filter(([date]) => selectedDateFilter === "All" || date === selectedDateFilter)
                    .map(([date, items]) => (
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
                            {items.map((item, idx) => (
                              <div key={idx} className="relative pl-8 group">
                                <div className="absolute -left-[5px] top-6 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white shadow-sm" />
                                
                                {item.type === 'travel' ? (
                                  <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100 hover:border-blue-300 hover:shadow-md transition-all">
                                    <div className="flex items-center gap-3 font-extrabold text-gray-900 text-lg mb-3">
                                        <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
                                          {item.mode === 'plane' || item.mode === 'flight' ? <Plane className="h-5 w-5" /> : 
                                           item.mode === 'car' ? <Car className="h-5 w-5" /> :
                                           item.mode === 'train' ? <Train className="h-5 w-5" /> :
                                           <Bike className="h-5 w-5" />}
                                        </div>
                                        <span>{item.origin} &rarr; {item.destination}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-6 mt-2 ml-1">
                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Departure</span>
                                          <div className="flex items-center gap-1.5 font-bold text-gray-900 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm"><Clock className="h-4 w-4 text-blue-600"/> {item.departureTime}</div>
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Arrival</span>
                                          <div className="flex items-center gap-1.5 font-bold text-gray-900 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm"><Clock className="h-4 w-4 text-emerald-600"/> {item.arrivalTime}</div>
                                        </div>
                                    </div>
                                  </div>
                                ) : item.type === 'place' ? (
                                  <div className="bg-gray-50/80 p-5 rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-md transition-all">
                                    <div className="flex items-center gap-3 font-extrabold text-gray-900 text-lg mb-2">
                                      <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
                                        <MapPin className="h-5 w-5" />
                                      </div>
                                      <span>{item.name}</span>
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
                                    <div className="flex items-center gap-3 font-extrabold text-gray-900 text-lg mb-2">
                                      <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
                                        <HotelIcon className="h-5 w-5" />
                                      </div>
                                      <span>{item.name}</span>
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
                                              <div className="flex items-center gap-1.5 font-bold text-gray-900 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm"><Clock className="h-4 w-4 text-indigo-600"/> {item.checkInTime}</div>
                                            </div>
                                          )}
                                          {item.checkOutTime && (
                                            <div className="flex flex-col">
                                              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Check-out</span>
                                              <div className="flex items-center gap-1.5 font-bold text-gray-900 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm"><Clock className="h-4 w-4 text-orange-600"/> {item.checkOutTime}</div>
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
                    ))
                  }
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

        {/* TAB CONTENT: TRAVELERS */}
        {activeTab === "travelers" && (
          <div className="grid gap-4">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-2 border-b border-gray-100 pb-2">Organizer</h3>
              <div className="flex items-center gap-3 mt-4">
                <div className="p-2 bg-blue-100 text-blue-800 rounded-full"><Users className="h-5 w-5"/></div>
                <span className="font-bold text-gray-900">{trip.createdBy}</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-2">
              <h3 className="font-bold text-gray-900 mb-2 border-b border-gray-100 pb-2">Invited Travelers</h3>
              {!trip.travelerPhones || trip.travelerPhones.length === 0 ? (
                 <p className="text-gray-600 font-medium mt-4">No travelers added to this trip yet.</p>
              ) : (
                <div className="space-y-4 mt-4">
                  {trip.travelerPhones.map((phone, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 text-gray-700 rounded-full"><Phone className="h-5 w-5"/></div>
                      <span className="font-bold text-gray-900 text-lg tracking-wide">{phone}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
