#!/usr/bin/env node

import terminalKit from "terminal-kit";
import { LlamaManagerApp } from "./LlamaManagerApp";

const term = terminalKit.terminal;

term.fullscreen(true);
term.grabInput({ mouse: 'motion' });
term.hideCursor();

const app = new LlamaManagerApp(term);
app.start();

process.on('SIGINT', () => {
  app.dispose();
  term.grabInput(false);
  term.fullscreen(false);
  term.styleReset();
  term.processExit(0);
});
