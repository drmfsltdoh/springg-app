import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/api";

const AUTH_STORAGE_KEY = "spring_user";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, phone, role, name, verificationStatus? }
  // Same login-persistence fix as before: read the saved session back on
  // launch, and show a splash (via `loading`) instead of flashing the login
  // screen while that check happens.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (saved) setUser(JSON.parse(saved));
      } catch (e) {
        // corrupted/inaccessible storage — treat as logged out
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Called after api.signup()/api.login() already stored the JWT tokens —
  // this just persists the lightweight user object the UI reads from.
  async function login(userData) {
    setUser(userData);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
  }

  async function updateUser(partial) {
    setUser((prev) => {
      const next = { ...(prev || {}), ...partial };
      AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  async function logout() {
    setUser(null);
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    await api.logout(); // clears the JWT tokens too
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
