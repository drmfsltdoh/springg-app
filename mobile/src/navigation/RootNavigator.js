import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";

import LandingScreen from "../screens/LandingScreen";
import LoginScreen from "../screens/LoginScreen";
import SignupScreen from "../screens/SignupScreen";

import RiderHomeScreen from "../screens/rider/RiderHomeScreen";
import TripStatusScreen from "../screens/rider/TripStatusScreen";
import HistoryScreen from "../screens/rider/HistoryScreen";
import WaitGameScreen from "../screens/rider/WaitGameScreen";
import ReviewScreen from "../screens/rider/ReviewScreen";

import DriverHomeScreen from "../screens/driver/DriverHomeScreen";
import DriverTripScreen from "../screens/driver/DriverTripScreen";
import RadioPlayerScreen from "../screens/driver/RadioPlayerScreen";

import ChatScreen from "../screens/shared/ChatScreen";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Landing" component={LandingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        ) : user.role === "driver" ? (
          <>
            <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
            <Stack.Screen name="DriverTrip" component={DriverTripScreen} options={{ headerShown: true, title: "Current Trip" }} />
            <Stack.Screen name="Radio" component={RadioPlayerScreen} options={{ headerShown: true, title: "Radio" }} />
            <Stack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ headerShown: true, title: route.params?.otherPartyName || "Chat" })} />
          </>
        ) : (
          <>
            <Stack.Screen name="RiderHome" component={RiderHomeScreen} />
            <Stack.Screen name="TripStatus" component={TripStatusScreen} options={{ headerShown: true, title: "Trip Status" }} />
            <Stack.Screen name="WaitGame" component={WaitGameScreen} />
            <Stack.Screen name="History" component={HistoryScreen} options={{ headerShown: true, title: "History" }} />
            <Stack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ headerShown: true, title: route.params?.otherPartyName || "Chat" })} />
            <Stack.Screen name="Review" component={ReviewScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
