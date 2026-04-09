import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/v2-theme.css";
import "./i18n";

createRoot(document.getElementById("root")!).render(<App />);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
