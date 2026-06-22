import * as React from "react";
import ReactDOM from "react-dom/client";
import "./design/theme.css";
import { App } from "./app/App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
