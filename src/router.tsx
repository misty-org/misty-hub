import { createHashRouter } from "react-router";
import Docs from "@docs/index";
import Changelog from "@website/pages/Changelog";
import { AuthProvider } from "./AuthContext";
import { HubShell } from "./components/HubShell";
import SettingsPage from "./pages/Account";
import HomePage from "./pages/Home";
import PluginsPage from "./pages/Plugins";
import Register from "./pages/Register";
import SignIn from "./pages/SignIn";

export const router = createHashRouter([
  {
    element: (
      <AuthProvider>
        <HubShell />
      </AuthProvider>
    ),
    children: [
      { index: true, element: <HomePage />, handle: { title: "Misty Hub - Home" } },
      { path: "docs/*", element: <Docs />, handle: { title: "Misty Hub - Docs" } },
      { path: "plugins", element: <PluginsPage />, handle: { title: "Misty Hub - Plugins" } },
      { path: "resources/changelog", element: <Changelog />, handle: { title: "Misty Hub - Changelog" } },
      { path: "account", element: <SettingsPage />, handle: { title: "Misty Hub - Account" } },
      { path: "settings", element: <SettingsPage />, handle: { title: "Misty Hub - Account" } },
      { path: "signin", element: <SignIn />, handle: { title: "Misty Hub - Sign In" } },
      { path: "register", element: <Register />, handle: { title: "Misty Hub - Register" } },
    ],
  },
]);
