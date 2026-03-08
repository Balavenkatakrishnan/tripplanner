"use client";

import { useEffect, useState } from "react";
import { getDB } from "@/lib/db";

const NOTIFIED_KEY = "trip_planner_notified";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

function getNotifiedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    if (!raw) return new Set();
    const { at, ids } = JSON.parse(raw);
    if (Date.now() - at > TTL_MS) return new Set();
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

function addNotified(id: string) {
  const set = getNotifiedSet();
  set.add(id);
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify({ at: Date.now(), ids: [...set] }));
  } catch {}
}

const NOTIFICATION_PREFS_KEY = "trip_planner_notification_prefs";

export type NotificationPrefs = { enabled: boolean; hoursBefore: number; travel: boolean; hotel: boolean; place: boolean; showOnDashboard: boolean };

function getNotificationPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return { enabled: true, hoursBefore: 1, travel: true, hotel: true, place: true, showOnDashboard: true };
  try {
    const s = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (s) {
      const o = JSON.parse(s);
      const hrs = typeof o.hoursBefore === "number" ? Math.max(1, Math.min(24, o.hoursBefore)) : 1;
      return {
        enabled: o.enabled !== false,
        hoursBefore: hrs,
        travel: o.travel !== false,
        hotel: o.hotel !== false,
        place: o.place !== false,
        showOnDashboard: o.showOnDashboard !== false,
      };
    }
  } catch {}
  return { enabled: true, hoursBefore: 1, travel: true, hotel: true, place: true, showOnDashboard: true };
}

function toEventDate(dateStr: string, timeStr: string): number {
  if (timeStr && timeStr.includes("T")) return new Date(timeStr).getTime();
  const date = (dateStr || "").slice(0, 10);
  let time = (timeStr || "09:00").trim();
  if (/^\d{1,2}:\d{2}$/.test(time)) time = `${time}:00`;
  return new Date(`${date}T${time}`).getTime();
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [prefs, setPrefsState] = useState<NotificationPrefs>(getNotificationPrefs);

  const setPrefs = (next: NotificationPrefs | ((prev: NotificationPrefs) => NotificationPrefs)) => {
    setPrefsState((prev) => {
      const nextVal = typeof next === "function" ? next(prev) : next;
      try {
        localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(nextVal));
      } catch {}
      return nextVal;
    });
  };

  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
    setPrefsState(getNotificationPrefs());
  }, []);

  useEffect(() => {
    const showNotif = (title: string, body: string, eventKey: string) => {
      if (getNotifiedSet().has(eventKey)) return;
      addNotified(eventKey);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => {
            reg.showNotification(title, { body, icon: "/icon.svg" });
          })
          .catch(() => {
            try {
              new Notification(title, { body, icon: "/icon.svg" });
            } catch {}
          });
      } else {
        try {
          new Notification(title, { body, icon: "/icon.svg" });
        } catch {}
      }
    };

    const checkUpcoming = async () => {
      const db = await getDB();
      if (!db || Notification.permission !== "granted") return;
      const prefsCurrent = getNotificationPrefs();
      if (!prefsCurrent.enabled) return;

      const now = Date.now();
      const hoursMs = prefsCurrent.hoursBefore * 60 * 60 * 1000;
      const hrs = prefsCurrent.hoursBefore;
      const timeStr = hrs === 1 ? "less than an hour" : `in ${hrs} hours`;

      if (prefsCurrent.travel) {
        const travels = await db.getAll("travelDetails");
        travels.forEach((t) => {
          const eventTime = toEventDate(t.date, t.departureTime);
          const diffMs = eventTime - now;
          if (diffMs > 0 && diffMs <= hoursMs) {
            showNotif("Upcoming Travel", `Your ${t.mode} to ${t.destination} is ${timeStr}!`, `travel-${t.id}`);
          }
        });
      }

      if (prefsCurrent.hotel) {
        const hotels = await db.getAll("hotels");
        hotels.forEach((h) => {
          const eventTime = toEventDate(h.date, h.checkInTime || "14:00");
          const diffMs = eventTime - now;
          if (diffMs > 0 && diffMs <= hoursMs) {
            showNotif("Hotel Check-in", `Check-in at ${h.name} is ${timeStr}!`, `hotel-${h.id}`);
          }
        });
      }

      if (prefsCurrent.place) {
        const places = await db.getAll("places");
        places.forEach((p) => {
          const visitTime = (p as { visitTime?: string }).visitTime || "09:00";
          const eventTime = toEventDate(p.date, visitTime);
          const diffMs = eventTime - now;
          if (diffMs > 0 && diffMs <= hoursMs) {
            showNotif("Place to Visit", `Visit ${p.name} ${timeStr}!`, `place-${p.id}`);
          }
        });
      }
    };

    checkUpcoming();
    const interval = setInterval(checkUpcoming, 1000 * 60 * 5);
    return () => clearInterval(interval);
  }, []);

  const requestPermission = async () => {
    if (!("Notification" in window)) return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification("Notifications Enabled", {
            body: "You will receive reminders for your upcoming trips.",
            icon: "/icon.svg",
          });
        } else {
          new Notification("Notifications Enabled", {
            body: "You will receive reminders for your upcoming trips.",
          });
        }
      } catch {}
      return true;
    }
    return false;
  };

  return { permission, requestPermission, prefs, setPrefs };
}
