import React from "react";
import ReactDOM from "react-dom/client";
import { platform } from "@tauri-apps/plugin-os";
import Intro from "./Intro";

// Per-platform CSS (Linux drops the heavy blurs), and "solid" when the window
// couldn't be made transparent (Linux without a compositor; intro.rs sets the
// flag): the stage then paints its own dark backdrop instead of a black box.
document.documentElement.dataset.platform = platform();
if ("__INTRO_SOLID__" in window) document.documentElement.dataset.solid = "";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Intro />
  </React.StrictMode>,
);
