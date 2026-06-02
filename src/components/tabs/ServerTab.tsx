import React from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { loadConfig, saveConfig, ConfigData, PRESET_CATEGORIES, PresetFieldDef, PresetCategory } from "../../lib/config.js";
import { startServer, stopServer, getStatus } from "../../lib/server.js";
import TextInput from "ink-text-input";

type ServerState = "stopped" | "starting" | "running" | "stopping";

type FocusMode = "controls" | "categories" | "edit" | "freeform";
interface EditTarget {
  categoryIndex: number;
  fieldIndex: number;
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatValue(value: unknown, field: PresetFieldDef): string {
  if (value === null || value === undefined) return "<default>";
  if (field.type === "boolean") return value ? "on" : "off";
  return String(value);
}

export default function ServerTab() {
  const [config, setConfig] = React.useState<ConfigData | null>(null);
  const [serverState, setServerState] = React.useState<ServerState>("stopped");
  const [pid, setPid] = React.useState<number | null>(null);
  const [uptime, setUptime] = React.useState(0);
  const [message, setMessage] = React.useState<string | null>(null);
  const [focusMode, setFocusMode] = React.useState<FocusMode>("controls");
  const [controlIndex, setControlIndex] = React.useState(0);
  const [expandedCategories, setExpandedCategories] = React.useState<Set<number>>(new Set());
  const [editTarget, setEditTarget] = React.useState<EditTarget | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const [freeformIndex, setFreeformIndex] = React.useState(0);

  React.useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  const uptimeInterval = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    if (serverState === "running") {
      uptimeInterval.current = setInterval(() => {
        const st = getStatus(config!);
        setUptime(Date.now() - (st.uptime || 0));
      }, 1000);
    } else {
      if (uptimeInterval.current) clearInterval(uptimeInterval.current);
      setUptime(0);
    }
    return () => {
      if (uptimeInterval.current) clearInterval(uptimeInterval.current);
    };
  }, [serverState, config]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleStart = async () => {
    if (!config) {
      showMessage("No config loaded");
      return;
    }
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

  const handleRestart = async () => {
    await handleStop();
    await handleStart();
  };

  const controls = ["Start", "Stop", "Restart"];
  const canStart = serverState === "stopped";
  const canStop = serverState === "running";

  const toggleCategory = (index: number) => {
    const next = new Set(expandedCategories);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setExpandedCategories(next);
  };

  const setValue = (categoryIndex: number, field: PresetFieldDef, raw: string) => {
    if (!config) return;
    const cat = PRESET_CATEGORIES[categoryIndex];
    const presets = { ...config.server.presets };
    const category = { ...(presets[cat.presetKey] as Record<string, unknown>) };
    let value: unknown = raw;
    if (field.type === "number") value = Number(raw);
    else if (field.type === "boolean") value = raw === "on";
    category[field.key] = value;
    presets[cat.presetKey] = category;
    const newConfig = { ...config, server: { ...config.server, presets } };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  const openEdit = (categoryIndex: number, fieldIndex: number) => {
    if (!config) return;
    const cat = PRESET_CATEGORIES[categoryIndex];
    const field = cat.fields[fieldIndex];
    const current = (config.server.presets[cat.presetKey] as Record<string, unknown>)[field.key];
    setEditTarget({ categoryIndex, fieldIndex });
    setEditValue(current !== null && current !== undefined ? String(current) : "");
    setFocusMode("edit");
  };

  const submitEdit = () => {
    if (!config || !editTarget) return;
    const cat = PRESET_CATEGORIES[editTarget.categoryIndex];
    const field = cat.fields[editTarget.fieldIndex];
    setValue(editTarget.categoryIndex, field, editValue);
    setEditTarget(null);
    setFocusMode("categories");
    showMessage(`${field.flag} = ${editValue}`);
  };

  const cycleEnum = (categoryIndex: number, field: PresetFieldDef) => {
    if (!config || !field.options) return;
    const cat = PRESET_CATEGORIES[categoryIndex];
    const current = (config.server.presets[cat.presetKey] as Record<string, unknown>)[field.key];
    const idx = field.options.indexOf(String(current));
    const nextIdx = (idx + 1) % field.options.length;
    setValue(categoryIndex, field, field.options[nextIdx]);
  };

  const toggleBoolean = (categoryIndex: number, field: PresetFieldDef) => {
    if (!config) return;
    const cat = PRESET_CATEGORIES[categoryIndex];
    const current = (config.server.presets[cat.presetKey] as Record<string, unknown>)[field.key];
    setValue(categoryIndex, field, String(!current));
  };

  const flattenedFields: Array<{ categoryIndex: number; fieldIndex: number }> = [];
  for (let ci = 0; ci < PRESET_CATEGORIES.length; ci++) {
    const cat = PRESET_CATEGORIES[ci];
    if (!expandedCategories.has(ci)) continue;
    for (let fi = 0; fi < cat.fields.length; fi++) {
      flattenedFields.push({ categoryIndex: ci, fieldIndex: fi });
    }
  }

  const [fieldCursor, setFieldCursor] = React.useState(0);

  useInput((input, key) => {
    if (input === "q") return;

    if (focusMode === "edit") {
      if (key.return) {
        submitEdit();
        return;
      }
      if (input === "\u0003") {
        setEditTarget(null);
        setFocusMode("categories");
        return;
      }
      return;
    }

    if (focusMode === "freeform") {
      if (key.upArrow) {
        setFocusMode("categories");
        return;
      }
      if (key.return && config) {
        const args = [...config.server.freeFormArgs];
        args[freeformIndex] = args[freeformIndex] || "";
        const newConfig = { ...config, server: { ...config.server, freeFormArgs: args } };
        setConfig(newConfig);
        saveConfig(newConfig);
        return;
      }
      return;
    }

    if (focusMode === "controls") {
      if (input === "l" || key.rightArrow) {
        setControlIndex((prev) => Math.min(prev + 1, controls.length - 1));
        return;
      }
      if (input === "h" || key.leftArrow) {
        setControlIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (key.return) {
        if (controlIndex === 0 && canStart) handleStart();
        else if (controlIndex === 1 && canStop) handleStop();
        else if (controlIndex === 2) handleRestart();
        return;
      }
      if (input === "j" || key.downArrow) {
        setFocusMode("categories");
        setFieldCursor(0);
        return;
      }
      return;
    }

    if (focusMode === "categories") {
      if (input === "k" || key.upArrow) {
        if (fieldCursor > 0) {
          setFieldCursor((prev) => prev - 1);
        } else {
          setFocusMode("controls");
        }
        return;
      }
      if (input === "j" || key.downArrow) {
        if (flattenedFields.length === 0) {
          const nextCat = PRESET_CATEGORIES.findIndex((_, i) => !expandedCategories.has(i));
          if (nextCat >= 0) toggleCategory(nextCat);
        } else if (fieldCursor < flattenedFields.length - 1) {
          setFieldCursor((prev) => prev + 1);
        }
        return;
      }
      if (key.return && flattenedFields.length > 0) {
        const { categoryIndex, fieldIndex } = flattenedFields[fieldCursor];
        const cat = PRESET_CATEGORIES[categoryIndex];
        const field = cat.fields[fieldIndex];
        if (field.type === "boolean") {
          toggleBoolean(categoryIndex, field);
        } else if (field.type === "enum") {
          cycleEnum(categoryIndex, field);
        } else {
          openEdit(categoryIndex, fieldIndex);
        }
        return;
      }
      if (input === "u") {
        if (fieldCursor >= 0 && flattenedFields.length > 0) {
          const { categoryIndex } = flattenedFields[fieldCursor];
          toggleCategory(categoryIndex);
          setFieldCursor(0);
        }
        return;
      }
      if (input === "g") {
        setFocusMode("controls");
        return;
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
            <Text color="gray"> │ </Text>
            <Text color={serverState === "running" ? "green" : serverState === "starting" ? "yellow" : serverState === "stopping" ? "yellow" : "red"}>
              {serverState === "starting" || serverState === "stopping" ? <><Text color="cyan"><Spinner type="line" /></Text> {serverState}</> : serverState}
            </Text>
          </Box>
          <Box>
            {pid && <Text color="gray">PID: {pid}</Text>}
            {serverState === "running" && (
              <>
                <Text color="gray"> │ </Text>
                <Text color="gray">Uptime: {formatUptime(uptime)}</Text>
              </>
            )}
          </Box>
        </Box>
        <Box>
          <Text color="gray">Version: </Text>
          <Text>{config.activeVersion || "<none>"}</Text>
          <Text color="gray"> │ </Text>
          <Text color="gray">URL: </Text>
          <Text color="blue">{`http://${host}:${port}`}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Box flexDirection="row">
          {controls.map((label, i) => {
            const isActive = focusMode === "controls" && controlIndex === i;
            const enabled = (i === 0 && canStart) || (i === 1 && canStop) || i === 2;
            return (
              <Box key={label} marginRight={1}>
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
          <Text color="green">› {message}</Text>
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        <Box marginBottom={1}>
          <Text color="gray" wrap="wrap">
            j/k navigate │ Enter edit/toggle │ u collapse │ g controls │ Ctrl+C cancel edit
          </Text>
        </Box>

        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {PRESET_CATEGORIES.map((cat, ci) => {
            const isExpanded = expandedCategories.has(ci);
            const preset = config.server.presets[cat.presetKey] as Record<string, unknown>;
            return (
              <Box key={cat.name} flexDirection="column">
                <Box>
                  <Text color={isExpanded ? "white" : "cyan"} bold>
                    {isExpanded ? "▼" : "▶"} {cat.name}
                  </Text>
                  <Text color="gray"> ({cat.fields.length} fields)</Text>
                </Box>
                {isExpanded &&
                  cat.fields.map((field, fi) => {
                    const value = preset[field.key];
                    const isCursor =
                      focusMode === "categories" &&
                      flattenedFields[fieldCursor]?.categoryIndex === ci &&
                      flattenedFields[fieldCursor]?.fieldIndex === fi;
                    const isEditing =
                      focusMode === "edit" &&
                      editTarget?.categoryIndex === ci &&
                      editTarget?.fieldIndex === fi;

                    if (isEditing && (field.type === "string" || field.type === "number")) {
                      return (
                        <Box key={field.key} marginLeft={2}>
                          <Text color="yellow" bold>
                            {field.flag}
                          </Text>
                          <Text color="gray"> {" "}</Text>
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
                        <Text
                          color={isCursor ? "yellow" : "gray"}
                          bold={isCursor}
                        >
                          {field.flag}
                        </Text>
                        <Text color="gray"> {" "}</Text>
                        <Text
                          color={isCursor ? "white" : value !== field.default ? "green" : "gray"}
                        >
                          {formatValue(value, field)}
                        </Text>
                        {field.type === "enum" && field.options && (
                          <>
                            <Text color="gray"> </Text>
                            <Text color="gray">({field.options.join("/")})</Text>
                          </>
                        )}
                        {isCursor && (
                          <>
                            <Text color="gray"> </Text>
                            <Text color="gray">
                              {field.type === "boolean" ? "[Enter toggle]" : field.type === "enum" ? "[Enter cycle]" : "[Enter edit]"}
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
          {(config.server.freeFormArgs.length > 0 || focusMode === "freeform") &&
            config.server.freeFormArgs.map((arg, i) => (
              <Box key={i} marginLeft={2}>
                <Text color={focusMode === "freeform" && freeformIndex === i ? "yellow" : "gray"}>
                  {i + 1}.
                </Text>
                <Text color="gray"> {" "}</Text>
                <Text color={focusMode === "freeform" && freeformIndex === i ? "white" : "cyan"}>
                  {arg || "<empty>"}
                </Text>
              </Box>
            ))}
          <Box marginLeft={2}>
            <Text color="gray">
              + Add arg (coming soon)
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
