"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { LogOut, Plus, MapPin, Calendar, Bell, RefreshCw } from "lucide-react";
import { useTrips } from "@/hooks/useTrips";
import { useSyncContext } from "@/hooks/useSync";
import { useNotifications } from "@/hooks/useNotifications";

export default function Home() {
  const { user, isLoading, logout } = useAuth();
  const { trips, loading: tripsLoading } = useTrips();
  const syncContext = useSyncContext();
  const { permission, requestPermission, prefs, setPrefs } = useNotifications();
  const router = useRouter();
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/coconut.svg" alt="Trip" className="h-8 w-8" />
            <h1 className="text-xl font-bold">Trip Planner</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm bg-blue-700 px-3 py-1 rounded-full border border-blue-500">
              {user.role === "organizer" ? user.username : "User: " + user.phoneNumber}
            </span>
            <div className="relative">
              <button
                onClick={() => setNotifMenuOpen((o) => !o)}
                className="p-2 hover:bg-blue-700 rounded-full transition-colors"
                aria-label="Notifications"
                title="Trip reminders"
              >
                <Bell className="h-5 w-5" />
              </button>
              {notifMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setNotifMenuOpen(false)} aria-hidden="true" />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-3 px-4 min-w-[260px]">
                    <p className="text-sm font-bold text-gray-900 mb-3">Trip reminders</p>
                    <label className="flex items-center gap-2 cursor-pointer mb-3">
                      <input type="checkbox" checked={prefs.enabled} onChange={e=>setPrefs(p=>({...p, enabled: e.target.checked}))} className="rounded border-gray-400 w-4 h-4" />
                      <span className="text-sm font-bold text-gray-900">Enable reminders</span>
                    </label>
                    {prefs.enabled && permission === "granted" && (
                      <div className="space-y-3 pt-2 border-t border-gray-200">
                        <div>
                          <label className="block text-sm font-bold text-gray-900 mb-1">Notify me</label>
                          <div className="flex items-center gap-2">
                            <input type="number" min={1} max={24} value={prefs.hoursBefore} onChange={e=>{ const v = parseInt(e.target.value, 10); if (!isNaN(v)) setPrefs(p=>({...p, hoursBefore: Math.max(1, Math.min(24, v))})); }} className="w-14 px-2 py-1 border-2 border-gray-300 rounded text-sm font-bold text-gray-900" />
                            <span className="text-sm font-bold text-gray-900">hours before</span>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-gray-900 pt-1">Event types</p>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={prefs.travel} onChange={e=>setPrefs(p=>({...p, travel: e.target.checked}))} className="rounded border-gray-400 w-4 h-4" /><span className="text-sm font-bold text-gray-900">Travel</span></label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={prefs.hotel} onChange={e=>setPrefs(p=>({...p, hotel: e.target.checked}))} className="rounded border-gray-400 w-4 h-4" /><span className="text-sm font-bold text-gray-900">Hotel check-in</span></label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={prefs.place} onChange={e=>setPrefs(p=>({...p, place: e.target.checked}))} className="rounded border-gray-400 w-4 h-4" /><span className="text-sm font-bold text-gray-900">Places to visit</span></label>
                      </div>
                    )}
                    {prefs.enabled && permission !== "granted" && (
                      <button onClick={() => { requestPermission(); setNotifMenuOpen(false); }} className="mt-2 w-full bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-blue-700">Turn on notifications</button>
                    )}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => syncContext?.sync()}
              disabled={syncContext?.isSyncing}
              className="p-2 hover:bg-blue-700 rounded-full transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              aria-label="Sync"
              title="Refresh from server"
            >
              {syncContext?.isSyncing ? (
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <RefreshCw className="h-5 w-5" />
              )}
            </button>
            <button 
              onClick={logout}
              className="p-2 hover:bg-blue-700 rounded-full transition-colors"
              aria-label="Logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Your Trips</h2>
          {user.role === "organizer" && (
            <button
              onClick={() => router.push("/trip/new")}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 shadow-sm font-bold transition-all"
            >
              <Plus className="h-5 w-5" />
              <span>New Trip</span>
            </button>
          )}
        </div>

        {prefs.showOnDashboard && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-full">
                  <Bell className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Trip Reminders</h3>
                  <p className="text-sm text-gray-600 text-balance">Get notified before travel, hotel check-in, and places to visit.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={prefs.enabled} onChange={e=>setPrefs(p=>({...p, enabled: e.target.checked}))} className="rounded border-gray-300" />
                  <span className="text-sm font-medium text-gray-900">Enable</span>
                </label>
                {permission !== "granted" && (
                  <button 
                    onClick={async () => { const ok = await requestPermission(); if (ok) setPrefs(p=>({...p, showOnDashboard: false})); }}
                    className="whitespace-nowrap bg-blue-600 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                  >
                    Turn On
                  </button>
                )}
              </div>
            </div>
            {prefs.enabled && permission === "granted" && (
              <div className="pt-2 border-t border-blue-200 space-y-3">
                <div className="mb-2">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Notify me</p>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} max={24} value={prefs.hoursBefore} onChange={e=>{ const v = parseInt(e.target.value, 10); if (!isNaN(v)) setPrefs(p=>({...p, hoursBefore: Math.max(1, Math.min(24, v))})); }} className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm font-medium" />
                    <span className="text-sm font-medium text-gray-700">hours before event</span>
                  </div>
                </div>
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Event types</p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={prefs.travel} onChange={e=>setPrefs(p=>({...p, travel: e.target.checked}))} className="rounded border-gray-300" />
                    <span className="text-sm font-medium text-gray-900">Travel</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={prefs.hotel} onChange={e=>setPrefs(p=>({...p, hotel: e.target.checked}))} className="rounded border-gray-300" />
                    <span className="text-sm font-medium text-gray-900">Hotel check-in</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={prefs.place} onChange={e=>setPrefs(p=>({...p, place: e.target.checked}))} className="rounded border-gray-300" />
                    <span className="text-sm font-medium text-gray-900">Places to visit</span>
                  </label>
                </div>
                <button type="button" onClick={() => setPrefs(p=>({...p, showOnDashboard: false}))} className="text-xs font-medium text-gray-500 hover:text-gray-700 underline">Don&apos;t show on dashboard</button>
              </div>
            )}
          </div>
        )}


        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tripsLoading ? (
            <div className="col-span-full flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : trips.length === 0 ? (
            <div className="col-span-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 flex flex-col items-center justify-center text-center">
              <MapPin className="h-12 w-12 text-gray-300 mb-4" />
              <p className="text-gray-600 font-bold text-lg">No trips planned yet.</p>
              {user.role === "organizer" && (
                <p className="text-sm font-medium text-gray-500 mt-2 max-w-sm">
                  Create your first trip to start organizing travel, places, and stays.
                </p>
              )}
            </div>
          ) : (
            trips.map((trip) => (
              <div
                key={trip.id}
                onClick={() => router.push(`/trip/${trip.id}`)}
                className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3.5 bg-blue-50/80 rounded-xl group-hover:bg-blue-600 transition-colors">
                    <MapPin className="h-6 w-6 text-blue-600 group-hover:text-white" />
                  </div>
                </div>
                <h3 className="text-xl font-extrabold text-gray-900 mb-2 truncate">{trip.name}</h3>
                <div className="flex items-center text-sm font-semibold text-gray-600 mb-1 border border-gray-100 bg-gray-50 px-3 py-2 rounded-lg w-fit">
                  <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                  <span>
                    {new Date(trip.startDate).toLocaleDateString()} - {new Date(trip.endDate).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
