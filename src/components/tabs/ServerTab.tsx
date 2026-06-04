import React from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { loadConfig, saveConfig, ConfigData, PRESET_CATEGORIES } from "../../lib/config.js";
import { startServer, stopServer, getStatus } from "../../lib/server.js";
import TextInput from "ink-text-input";
import { useOnClick } from "@ink-tools/ink-mouse";

type ServerState = "stopped" | "starting" | "running" | "stopping";
type FocusArea = "controls" | "form";

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return "";
  if (type === "boolean") return value ? "on" : "off";
  return String(value);
}

function buildFieldList(config: ConfigData, collapsed: Set<number>) {
  const items: Array<{
    type: "header" | "field";
    categoryIndex: number;
    fieldIndex?: number;
  }> = [];
  for (let ci = 0; ci < PRESET_CATEGORIES.length; ci++) {
    items.push({ type: "header", categoryIndex: ci });
    if (!collapsed.has(ci)) {
      for (let fi = 0; fi < PRESET_CATEGORIES[ci].fields.length; fi++) {
        items.push({ type: "field", categoryIndex: ci, fieldIndex: fi });
      }
    }
  }
  return items;
}

export default function ServerTab() {
  const [config, setConfig] = React.useState<ConfigData | null>(null);
  const [serverState, setServerState] = React.useState<ServerState>("stopped");
  const [pid, setPid] = React.useState<number | null>(null);
  const [uptime, setUptime] = React.useState(0);
  const [message, setMessage] = React.useState<string | null>(null);
  const [focusArea, setFocusArea] = React.useState<FocusArea>("controls");
  const [controlIndex, setControlIndex] = React.useState(0);
  const [collapsed, setCollapsed] = React.useState<Set<number>>(new Set());
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [editMode, setEditMode] = React.useState(false);
  const [editValue, setEditValue] = React.useState("");

  const controlRefs = React.useRef<React.RefObject<React.ComponentRef<typeof Box>>[]>([]);
  const headerRefs = React.useRef<React.RefObject<React.ComponentRef<typeof Box>>[]>([]);
  const fieldRowRefs = React.useRef<React.RefObject<React.ComponentRef<typeof Box>>[]>([]);

  controlRefs.current = Array.from({ length: 3 }, (_, i) => controlRefs.current[i] || React.createRef());
  headerRefs.current = PRESET_CATEGORIES.map((_, i) => headerRefs.current[i] || React.createRef());
  fieldRowRefs.current = Array.from({ length: PRESET_CATEGORIES.reduce((sum, c) => sum + c.fields.length, 0) }, (_, i) => fieldRowRefs.current[i] || React.createRef());

  controlRefs.current.forEach((ref, i) => {
    useOnClick(ref, () => {
      setControlIndex(i);
      if (i === 0 && canStart) handleStart();
      else if (i === 1 && canStop) handleStop();
      else if (i === 2) { handleStop().then(() => handleStart()); }
    });
  });

  headerRefs.current.forEach((ref, i) => {
    useOnClick(ref, () => {
      const headerIndex = fieldList.findIndex((item) => item.type === "header" && item.categoryIndex === i);
      setSelectedIndex(headerIndex);
      setFocusArea("form");
      toggleGroup(i);
    });
  });

  fieldRowRefs.current.forEach((ref, i) => {
    useOnClick(ref, () => {
      const item = fieldOnlyList[i];
      const pos = fieldList.findIndex((fl) => fl.type === "field" && fl.categoryIndex === item.categoryIndex && fl.fieldIndex === item.fieldIndex);
      setSelectedIndex(pos);
      setFocusArea("form");
      if (config && item.fieldIndex !== undefined) {
        const cat = PRESET_CATEGORIES[item.categoryIndex];
        const field = cat.fields[item.fieldIndex];
        if (field.type === "boolean") {
          const current = (config.server.presets[cat.presetKey] as Record<string, unknown>)[field.key];
          setValue(item.categoryIndex, field.key, field.type, String(!current));
        } else if (field.type === "enum" && field.options) {
          const current = (config.server.presets[cat.presetKey] as Record<string, unknown>)[field.key];
          const idx = field.options.indexOf(String(current));
          setValue(item.categoryIndex, field.key, field.type, field.options[(idx + 1) % field.options.length]);
        }
      }
    });
  });

  React.useEffect(() => {
    loadConfig().then((c) => {
      setConfig(c);
      setCollapsed(new Set([1, 2, 3, 4, 5, 6, 7]));
    });
  }, []);

  const uptimeRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  React.useEffect(() => {
    if (serverState === "running") {
      const start = Date.now() - uptime;
      uptimeRef.current = setInterval(() => setUptime(Date.now() - start), 1000);
    } else {
      if (uptimeRef.current) clearInterval(uptimeRef.current);
      setUptime(0);
    }
    return () => { if (uptimeRef.current) clearInterval(uptimeRef.current); };
  }, [serverState]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleStart = async () => {
    if (!config) { showMessage("No config loaded"); return; }
    setServerState("starting");
    try {
      const p = await startServer(config);
      setPid(p);
      setServerState("running");
      showMessage(`Server started (PID ${p})`);
    } catch (err: any) {
      setServerState("stopped");
      showMessage(`Start failed: ${err.message}`);
    }
  };

  const handleStop = async () => {
    setServerState("stopping");
    try {
      await stopServer();
      setPid(null);
      setServerState("stopped");
      showMessage("Server stopped");
    } catch (err: any) {
      showMessage(`Stop failed: ${err.message}`);
    }
  };

  const controls = ["Start", "Stop", "Restart"];
  const canStart = serverState === "stopped";
  const canStop = serverState === "running";

  const fieldList = config ? buildFieldList(config, collapsed) : [];

  const fieldOnlyList = fieldList.filter((item) => item.type === "field");

  const setValue = (ci: number, key: string, type: string, raw: string) => {
    if (!config) return;
    const cat = PRESET_CATEGORIES[ci];
    const presets = { ...config.server.presets };
    const category = { ...(presets[cat.presetKey] as Record<string, unknown>) };
    let value: unknown = raw;
    if (type === "number") value = Number(raw);
    else if (type === "boolean") value = raw === "on";
    category[key] = value;
    presets[cat.presetKey] = category;
    const newConfig = { ...config, server: { ...config.server, presets } };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  const toggleGroup = (ci: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(ci)) next.delete(ci);
      else next.add(ci);
      return next;
    });
  };

  const moveUp = () => {
    setSelectedIndex((prev) => {
      if (prev > 0) return prev - 1;
      return prev;
    });
  };

  const moveDown = () => {
    setSelectedIndex((prev) => {
      if (prev < fieldList.length - 1) return prev + 1;
      return prev;
    });
  };

  const currentItem = fieldList[selectedIndex];

  useInput((input, key) => {
    if (editMode) {
      if (key.return) {
        if (currentItem && currentItem.type === "field" && config && currentItem.fieldIndex !== undefined) {
          const cat = PRESET_CATEGORIES[currentItem.categoryIndex];
          const field = cat.fields[currentItem.fieldIndex];
          setValue(currentItem.categoryIndex, field.key, field.type, editValue);
          showMessage(`${field.flag} = ${editValue}`);
        }
        setEditMode(false);
      } else if (input === "\u0003") {
        setEditMode(false);
      }
      return;
    }

    if (focusArea === "controls") {
      if (input === "l" || key.rightArrow) {
        setControlIndex((prev) => Math.min(prev + 1, controls.length - 1));
      } else if (input === "h" || key.leftArrow) {
        setControlIndex((prev) => Math.max(prev - 1, 0));
      } else if (key.return) {
        if (controlIndex === 0 && canStart) handleStart();
        else if (controlIndex === 1 && canStop) handleStop();
        else if (controlIndex === 2) { handleStop().then(() => handleStart()); }
      } else if (input === "j" || key.downArrow) {
        if (fieldList.length > 0) {
          setFocusArea("form");
          setSelectedIndex(0);
        }
      }
    } else if (focusArea === "form") {
      if (input === "k" || key.upArrow) {
        if (selectedIndex > 0) {
          moveUp();
        } else {
          setFocusArea("controls");
        }
      } else if (input === "j" || key.downArrow) {
        if (selectedIndex < fieldList.length - 1) {
          moveDown();
        }
      } else if (key.return && currentItem) {
        if (currentItem.type === "header") {
          toggleGroup(currentItem.categoryIndex);
        } else if (config && currentItem.fieldIndex !== undefined) {
          const cat = PRESET_CATEGORIES[currentItem.categoryIndex];
          const field = cat.fields[currentItem.fieldIndex];
          if (field.type === "boolean") {
            const current = (config.server.presets[cat.presetKey] as Record<string, unknown>)[field.key];
            setValue(currentItem.categoryIndex, field.key, field.type, String(!current));
          } else if (field.type === "enum" && field.options) {
            const current = (config.server.presets[cat.presetKey] as Record<string, unknown>)[field.key];
            const idx = field.options.indexOf(String(current));
            setValue(currentItem.categoryIndex, field.key, field.type, field.options[(idx + 1) % field.options.length]);
          } else {
            const current = (config.server.presets[cat.presetKey] as Record<string, unknown>)[field.key];
            setEditValue(current !== null && current !== undefined ? String(current) : "");
            setEditMode(true);
          }
        }
      } else if (input === "g") {
        setFocusArea("controls");
      }
    }
  });

  if (!config) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box paddingTop={1}>
          <Text color="gray">Loading config...</Text>
        </Box>
      </Box>
    );
  }

  const host = String(config.server.presets.server.host || "127.0.0.1");
  const port = String(config.server.presets.server.port || 8080);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" borderStyle="single" borderColor="gray">
        <Box flexDirection="row" justifyContent="space-between">
          <Box>
            <Text bold>Server</Text>
            <Text> {" │ "} </Text>
            <Text color={serverState === "running" ? "green" : serverState === "starting" || serverState === "stopping" ? "yellow" : "red"}>
              {serverState === "starting" || serverState === "stopping"
                ? <><Text color="cyan"><Spinner type="line" /></Text> {serverState}</>
                : serverState}
            </Text>
          </Box>
          <Box>
            {pid && <Text color="gray">PID: {pid}</Text>}
            {serverState === "running" && (
              <>
                <Text> {" │ "} </Text>
                <Text color="gray">Uptime: {formatUptime(uptime)}</Text>
              </>
            )}
          </Box>
        </Box>
        <Box>
          <Text color="gray">Version: </Text>
          <Text>{config.activeVersion || "<none>"}</Text>
          <Text> {" │ "} </Text>
          <Text color="gray">URL: </Text>
          <Text color="blue">{`http://${host}:${port}`}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Box flexDirection="row">
          {controls.map((label, i) => {
            const isActive = focusArea === "controls" && controlIndex === i;
            const enabled = (i === 0 && canStart) || (i === 1 && canStop) || i === 2;
            return (
              <Box key={label} marginRight={1} ref={controlRefs.current[i]}>
                <Text
                  bold={isActive}
                  color={isActive ? "white" : enabled ? "cyan" : "gray"}
                  backgroundColor={isActive ? "white" : undefined}
                >
                  {` ${label} `}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {message && (
        <Box marginTop={1}>
          <Text color="green">{` › ${message}`}</Text>
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        <Box marginBottom={1}>
          <Text color="gray" wrap="wrap">
            j/k navigate │ Enter edit/toggle │ Space expand/collapse │ g controls │ Ctrl+C cancel edit
          </Text>
        </Box>

        <Box flexDirection="column" flexGrow={1}>
          {PRESET_CATEGORIES.map((cat, ci) => {
            const isCollapsed = collapsed.has(ci);
            const preset = config.server.presets[cat.presetKey] as Record<string, unknown>;

            const headerIndex = fieldList.findIndex((item) => item.type === "header" && item.categoryIndex === ci);
            const isHeaderSelected = focusArea === "form" && selectedIndex === headerIndex && !editMode;

            return (
              <Box key={cat.name} flexDirection="column">
                <Box ref={headerRefs.current[ci]}>
                  <Text
                    color={isHeaderSelected ? "white" : "cyan"}
                    bold={isHeaderSelected}
                    backgroundColor={isHeaderSelected ? "white" : undefined}
                  >
                    {isCollapsed ? "▶" : "▼"} {cat.name} ({cat.fields.length})
                  </Text>
                </Box>
                {!isCollapsed &&
                  cat.fields.map((field, fi) => {
                    const value = preset[field.key];
                    const fieldPos = fieldList.findIndex((item) =>
                      item.type === "field" && item.categoryIndex === ci && item.fieldIndex === fi
                    );
                    const isSelected = focusArea === "form" && selectedIndex === fieldPos && !editMode;
                    const fieldOnlyIndex = fieldOnlyList.findIndex((item) => item.categoryIndex === ci && item.fieldIndex === fi);
                    const isEditing = editMode && selectedIndex === fieldPos;

                    if (isEditing && (field.type === "string" || field.type === "number")) {
                      return (
                 <Box key={field.key} marginLeft={2} ref={fieldOnlyIndex !== -1 ? fieldRowRefs.current[fieldOnlyIndex] : undefined}>
                          <Text color="yellow" bold>{field.flag}</Text>
                          <Text> {" "} </Text>
                          <TextInput
                            value={editValue}
                            onChange={setEditValue}
                            focus
                          />
                        </Box>
                      );
                    }

                    return (
                      <Box key={field.key} marginLeft={2}>
                        <Text color={isSelected ? "white" : "gray"} bold={isSelected}>
                          {field.flag}
                        </Text>
                        <Text> {" "} </Text>
                        <Text color={isSelected ? "white" : value !== field.default ? "green" : "gray"}>
                          {formatValue(value, field.type) || <Text color="gray">&lt;default&gt;</Text>}
                        </Text>
                        {field.type === "enum" && field.options && (
                          <>
                            <Text> {" "} </Text>
                            <Text color="gray">{`[${field.options.join("/")}]`}</Text>
                          </>
                        )}
                        {isSelected && (
                          <>
                            <Text> {" "} </Text>
                            <Text color="gray">
                              {field.type === "boolean" ? "[toggle]"
                                : field.type === "enum" ? "[cycle]" : "[edit]"}
                            </Text>
                          </>
                        )}
                      </Box>
                    );
                  })}
              </Box>
            );
          })}

          <Box marginTop={1}>
            <Text color="white" bold>Free-form args</Text>
            <Text color="gray"> (arbitrary flags)</Text>
          </Box>
          {config.server.freeFormArgs.length > 0
            ? config.server.freeFormArgs.map((arg, i) => (
                <Box key={i} marginLeft={2}>
                  <Text color="gray">{`${i + 1}. `}</Text>
                  <Text color="cyan">{arg}</Text>
                </Box>
              ))
            : (
                <Box marginLeft={2}>
                  <Text color="gray">None configured</Text>
                </Box>
              )}
        </Box>
      </Box>
    </Box>
  );
}
