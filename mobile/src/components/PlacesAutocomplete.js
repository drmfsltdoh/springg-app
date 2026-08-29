import React, { useEffect, useRef, useState } from "react";
import { View, TextInput, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { api } from "../api/api";

// Address autocomplete backed by OUR OWN backend (/api/v1/places/search),
// which proxies free OpenStreetMap search server-side. No Google API key,
// no billing account, needed anywhere in this app anymore.
//
// Props: placeholder, value, onChangeText(text), onSelect({address,lat,lng}),
//        colors, radius (from useTheme())
export default function PlacesAutocomplete({ placeholder, value, onChangeText, onSelect, colors, radius }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!focused || !value || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 350);
    return () => clearTimeout(debounceRef.current);
  }, [value, focused]);

  async function fetchSuggestions(text) {
    setLoading(true);
    try {
      const results = await api.searchPlaces(text);
      setSuggestions(results);
    } catch (e) {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  function selectPlace(place) {
    setSuggestions([]);
    setFocused(false);
    onChangeText(place.name);
    onSelect?.({ address: place.name, lat: place.lat, lng: place.lng });
  }

  const showDropdown = focused && (loading || suggestions.length > 0);

  return (
    <View>
      <TextInput
        style={{ fontSize: 16, color: colors.textPrimary, paddingVertical: 8 }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {showDropdown && (
        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: 4, marginBottom: 8, overflow: "hidden" }}>
          {loading && <ActivityIndicator size="small" color={colors.primary} style={{ padding: 10 }} />}
          {!loading &&
            suggestions.map((item, idx) => (
              <TouchableOpacity
                key={`${item.lat}-${item.lng}-${idx}`}
                style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                onPress={() => selectPlace(item)}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14 }} numberOfLines={2}>{item.name}</Text>
              </TouchableOpacity>
            ))}
          {!loading && suggestions.length === 0 && value.trim().length >= 3 && (
            <Text style={{ color: colors.textMuted, fontSize: 12, padding: 12 }}>No matches found</Text>
          )}
        </View>
      )}
    </View>
  );
}
