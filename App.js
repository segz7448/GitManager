import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar, TouchableOpacity, Text } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SidebarProvider, useSidebar } from './src/context/SidebarContext';
import SidebarMenu from './src/components/SidebarMenu';
import { navigationRef } from './src/navigation';
import { ensureBackgroundTaskRegistered } from './src/backgroundTasks';
import { colors } from './src/theme';

import LoginScreen from './src/screens/LoginScreen';
import RepoListScreen from './src/screens/RepoListScreen';
import RepoDetailScreen from './src/screens/RepoDetailScreen';
import FileEditorScreen from './src/screens/FileEditorScreen';
import ZipUploadScreen from './src/screens/ZipUploadScreen';
import ActionsListScreen from './src/screens/ActionsListScreen';
import RunDetailScreen from './src/screens/RunDetailScreen';
import WorkflowDispatchScreen from './src/screens/WorkflowDispatchScreen';
import CodeSearchScreen from './src/screens/CodeSearchScreen';
import TerminalScreen from './src/screens/TerminalScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import IssuesScreen from './src/screens/IssuesScreen';
import ActivityScreen from './src/screens/ActivityScreen';

const RootStack = createNativeStackNavigator();
const ReposStackNav = createNativeStackNavigator();
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

function HamburgerButton() {
  const { open } = useSidebar();
  return (
    <TouchableOpacity onPress={open} style={{ paddingHorizontal: 12 }}>
      <Text style={{ color: colors.fgDefault, fontSize: 20 }}>☰</Text>
    </TouchableOpacity>
  );
}

function ReposStack() {
  return (
    <ReposStackNav.Navigator screenOptions={screenOptions}>
      <ReposStackNav.Screen
        name="RepoList"
        component={RepoListScreen}
        options={{ title: 'Repositories', headerLeft: () => <HamburgerButton /> }}
      />
      <ReposStackNav.Screen name="RepoDetail" component={RepoDetailScreen} options={{ title: 'Repo' }} />
      <ReposStackNav.Screen name="FileEditor" component={FileEditorScreen} options={{ title: 'Edit File' }} />
      <ReposStackNav.Screen name="ZipUpload" component={ZipUploadScreen} options={{ title: 'Upload ZIP' }} />
      <ReposStackNav.Screen name="Actions" component={ActionsListScreen} options={{ title: 'Actions' }} />
      <ReposStackNav.Screen name="RunDetail" component={RunDetailScreen} options={{ title: 'Run' }} />
      <ReposStackNav.Screen name="WorkflowDispatch" component={WorkflowDispatchScreen} options={{ title: 'Run Workflow' }} />
      <ReposStackNav.Screen name="CodeSearch" component={CodeSearchScreen} options={{ title: 'Code Search' }} />
    </ReposStackNav.Navigator>
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
        name="Terminal"
        component={TerminalScreen}
        options={{
          tabBarLabel: 'Terminal',
          headerShown: true,
          headerStyle: { backgroundColor: colors.bgSubtle },
          headerTintColor: colors.fgDefault,
          headerTitle: 'Terminal (Termux)',
          headerLeft: () => <HamburgerButton />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          headerShown: true,
          headerStyle: { backgroundColor: colors.bgSubtle },
          headerTintColor: colors.fgDefault,
          headerTitle: 'Settings',
          headerLeft: () => <HamburgerButton />,
        }}
      />
    </Tab.Navigator>
  );
}

function AuthenticatedApp() {
  React.useEffect(() => {
    ensureBackgroundTaskRegistered().catch(() => {
      // Background tasks are best-effort - if registration fails (e.g.
      // battery optimization blocking it on some OEM ROMs), the app still
      // works fine, it just won't get background completion notifications.
    });
  }, []);

  return (
    <SidebarProvider>
      <RootStack.Navigator screenOptions={screenOptions}>
        <RootStack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <RootStack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: 'Profile' }}
        />
        <RootStack.Screen
          name="Issues"
          component={IssuesScreen}
          options={{ title: 'Your Issues' }}
        />
        <RootStack.Screen
          name="Activity"
          component={ActivityScreen}
          options={{ title: 'Recent Activity' }}
        />
      </RootStack.Navigator>
      <SidebarMenu />
    </SidebarProvider>
  );
}

function RootNavigator() {
  const { token, loading } = useAuth();

  if (loading) return null; // could add a splash screen here

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {token ? (
        <AuthenticatedApp />
      ) : (
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Login" component={LoginScreen} />
        </RootStack.Navigator>
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
