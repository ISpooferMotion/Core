import { createApp } from "@ispoofermotion/core";
import React from "react";
import { createRoot } from "react-dom/client";
import "@ispoofermotion/core/styles.css";

const App = createApp(() => {});
createRoot(document.getElementById("root")).render(React.createElement(App));
