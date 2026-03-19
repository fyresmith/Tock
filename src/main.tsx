import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { PopupApp } from "./PopupApp";
import "./styles/globals.css";

const isPopup = getCurrentWindow().label === "timer-popup";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isPopup ? <PopupApp /> : <App />}
  </React.StrictMode>,
);
