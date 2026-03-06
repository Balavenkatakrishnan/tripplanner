"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Role = "organizer" | "user" | null;

export interface User {
  id: string;
  role: Role;
  username?: string; // For organizer
  phoneNumber?: string; // For user
}

interface AuthContextType {
  user: User | null;
  loginAsOrganizer: (username: string, password: string) => Promise<boolean | string>;
  loginAsUser: (phoneNumber: string) => Promise<boolean | string>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load session from localStorage
    const savedUser = localStorage.getItem("trip_planner_user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse saved user", e);
      }
    }
    setIsLoading(false);
  }, []);

  const loginAsOrganizer = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'organizer', identifier: username, password })
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        const newUser: User = { id: `org-${username}`, ...data.user };
        setUser(newUser);
        localStorage.setItem("trip_planner_user", JSON.stringify(newUser));
        setIsLoading(false);
        return true;
      }
      setIsLoading(false);
      return data.error || "Invalid credentials";
    } catch (e) {
      setIsLoading(false);
      return "Network error occurred";
    }
  };

  const loginAsUser = async (phoneNumber: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', identifier: phoneNumber })
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        const newUser: User = { id: `user-${phoneNumber}`, ...data.user };
        setUser(newUser);
        localStorage.setItem("trip_planner_user", JSON.stringify(newUser));
        setIsLoading(false);
        return true;
      }
      setIsLoading(false);
      return data.error || "Invalid phone number";
    } catch (e) {
      setIsLoading(false);
      return "Network error occurred";
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("trip_planner_user");
  };

  return (
    <AuthContext.Provider value={{ user, loginAsOrganizer, loginAsUser, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
