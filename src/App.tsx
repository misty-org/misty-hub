import { useEffect } from "react";
import { createHashRouter, RouterProvider } from "react-router";
import { AuthProvider } from "./AuthContext";
import { AppFrame } from "./components/AppFrame";
import { InstallPage } from "./pages/InstallPage";
import Register from "./pages/Register";
import { SettingsPage } from "./pages/SettingsPage";
import SignIn from "./pages/SignIn";
import { useSetupStore } from "./store/useSetupStore";
import "./App.css";

const router = createHashRouter([
  {
    element: (
      <AuthProvider>
        <AppFrame />
      </AuthProvider>
    ),
    children: [
      {
        index: true,
        element: <InstallPage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "signin",
        element: <SignIn />,
      },
      {
        path: "register",
        element: <Register />,
      },
    ],
  },
]);

export default function App() {
  const loadSystem = useSetupStore((state) => state.loadSystem);

  useEffect(() => {
    void loadSystem();
  }, [loadSystem]);

  return <RouterProvider router={router} />;
}
