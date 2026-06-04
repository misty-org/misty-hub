import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { useSetupStore } from "./store/useSetupStore";
import "./App.css";
import { router } from "./router";

export default function App() {
  const { loadSystem, refreshLocalAccessToken } = useSetupStore();

  useEffect(() => {
    void loadSystem();
  }, [loadSystem]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshLocalAccessToken();
    }, 10 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [refreshLocalAccessToken]);

  return <RouterProvider router={router} />;
}
