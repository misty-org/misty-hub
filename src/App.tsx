import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { useSetupStore } from "./store/useSetupStore";
import "./App.css";
import { router } from "./router";

export default function App() {
  const { loadSystem } = useSetupStore();

  useEffect(() => {
    void loadSystem();
  }, [loadSystem]);

  return <RouterProvider router={router} />;
}
