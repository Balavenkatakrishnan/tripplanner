"use client";

import { useEffect, useState } from "react";
import { getDB } from "@/lib/db";

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
    
    // Simple interval to check for upcoming events
    const checkUpcoming = async () => {
      const db = await getDB();
      if (!db || Notification.permission !== "granted") return;
      
      const travels = await db.getAll("travelDetails");
      const now = new Date();
      
      travels.forEach(t => {
        // Very basic time check logic
        const eventDateStr = `${t.date}T${t.departureTime}`;
        const eventDate = new Date(eventDateStr);
        const diffHours = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        
        // If event is exactly 24 hours away or 1 hour away (mock logic: just checking if it is close)
        // In a real app we'd track "notified" state in DB to prevent spam
        if (diffHours > 0 && diffHours < 1) {
          navigator.serviceWorker.ready.then(registration => {
            registration.showNotification("Upcoming Travel", {
              body: `Your ${t.mode} to ${t.destination} is in less than an hour!`,
              icon: "/icon.svg",
            });
          });
        }
      });
    };

    const interval = setInterval(checkUpcoming, 1000 * 60 * 15); // check every 15 mins
    return () => clearInterval(interval);
  }, []);

  const requestPermission = async () => {
    if (!("Notification" in window)) return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    
    if (result === "granted") {
      new Notification("Notifications Enabled", {
        body: "You will receive reminders for your upcoming trips.",
      });
      return true;
    }
    return false;
  };

  return { permission, requestPermission };
}
