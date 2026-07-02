import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { colors } from './src/theme';

import LoginScreen from './src/screens/LoginScreen';
import RepoListScreen from './src/screens/RepoListScreen';
import RepoDetailScreen from './src/screens/RepoDetailScreen';
import FileEditorScreen from './src/screens/FileEditorScreen';
import ZipUploadScreen from './src/screens/ZipUploadScreen';
import ActionsListScreen from './src/screens/ActionsListScreen';
import RunDetailScreen from './src/screens/RunDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bgDefault,
    card: colors.bgSubtle,
    border: colors.border,
    text: colors.fgDefault,
    primary: colors.accent,
  },
};

const screenOptions = {
  headerStyle: { backgroundColor: colors.bgSubtle },
  headerTintColor: colors.fgDefault,
  headerTitleStyle: { color: colors.fgDefault },
  contentStyle: { backgroundColor: colors.bgDefault },
};

function ReposStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="RepoList" component={RepoListScreen} options={{ title: 'Repositories' }} />
      <Stack.Screen name="RepoDetail" component={RepoDetailScreen} options={{ title: 'Repo' }} />
      <Stack.Screen name="FileEditor" component={FileEditorScreen} options={{ title: 'Edit File' }} />
      <Stack.Screen name="ZipUpload" component={ZipUploadScreen} options={{ title: 'Upload ZIP' }} />
      <Stack.Screen name="Actions" component={ActionsListScreen} options={{ title: 'Actions' }} />
      <Stack.Screen name="RunDetail" component={RunDetailScreen} options={{ title: 'Run' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bgSubtle, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.fgSubtle,
      }}
    >
      <Tab.Screen name="Repos" component={ReposStack} options={{ tabBarLabel: 'Repos' }} />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings', headerShown: false }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { token, loading } = useAuth();

  if (loading) return null; // could add a splash screen here

  return (
    <NavigationContainer theme={navTheme}>
      {token ? (
        <MainTabs />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDefault} />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
