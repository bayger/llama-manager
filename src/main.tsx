#!/usr/bin/env node

import React from "react";
import { withFullScreen } from "fullscreen-ink";
import App from "./components/App.js";

withFullScreen(<App />).start();
