#!/usr/bin/env node

import terminalKit from "terminal-kit";
import { App } from "./components/App";

const term = terminalKit.terminal;

term.fullscreen(true);
term.grabInput({ mouse: 'drag' });
term.hideCursor();

const app = new App(term);
app.start();

process.on('SIGINT', () => {
  app.dispose();
  term.grabInput(false);
  term.fullscreen(false);
  term.styleReset();
  term.processExit(0);
});
