import React from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useOnClick } from "@ink-tools/ink-mouse";
import { loadConfig, saveConfig, ConfigData } from "../../lib/config.js";
import { theme } from "../../lib/theme.js";

type FieldType = "string" | "number" | "boolean" | "password";

interface OptionField {
  key: string;
  label: string;
  type: FieldType;
  section: string;
  configPath?: string[];
  default?: unknown;
  description: string;
}

const FIELDS: OptionField[] = [
  {
    key: "hfToken",
    label: "HF Token",
    type: "password",
    section: "Credentials",
    default: null,
    description: "HuggingFace API token for model downloads",
  },
  {
    key: "versionsDir",
    label: "Versions Dir",
    type: "string",
    section: "Paths",
    default: null,
    description: "Custom directory for llama.cpp version binaries",
  },
  {
    key: "modelsDir",
    label: "Models Dir",
    type: "string",
    section: "Paths",
    default: null,
    description: "Custom directory for downloaded models",
  },
  {
    key: "tasksFile",
    label: "Tasks File",
    type: "string",
    section: "Paths",
    default: null,
    description: "Custom path for tasks JSONL file",
  },
  {
    key: "pollIntervalMs",
    label: "Poll Interval",
    type: "number",
    section: "Dashboard",
    configPath: ["dashboard", "pollIntervalMs"],
    default: 2000,
    description: "Dashboard polling interval in milliseconds",
  },
  {
    key: "killServerOnExit",
    label: "Kill Server on Exit",
    type: "boolean",
    section: "Dashboard",
    configPath: ["dashboard", "killServerOnExit"],
    default: false,
    description: "Automatically kill server when exiting the app",
  },
  {
    key: "maxStored",
    label: "Max Stored Tasks",
    type: "number",
    section: "Tasks",
    configPath: ["tasks", "maxStored"],
    default: 10000,
    description: "Maximum number of tasks to store in history",
  },
  {
    key: "autoParse",
    label: "Auto Parse Tasks",
    type: "boolean",
    section: "Tasks",
    configPath: ["tasks", "autoParse"],
    default: true,
    description: "Automatically parse task results on completion",
  },
];

const SECTIONS = [...new Set(FIELDS.map((f) => f.section))];

function formatValue(value: unknown, type: FieldType): string {
  if (value === null || value === undefined) return "";
  if (type === "boolean") return value ? "on" : "off";
  if (type === "password" && value) return `●●●●●●${String(value).slice(-4)}`;
  return String(value);
}

function getValue(config: ConfigData, field: OptionField): unknown {
  if (field.configPath && field.configPath.length > 0) {
    let obj: unknown = config;
    for (const key of field.configPath) {
      if (obj && typeof obj === "object" && key in obj) {
        obj = (obj as Record<string, unknown>)[key];
      } else {
        return field.default;
      }
    }
    return obj;
  }
  return (config as unknown as Record<string, unknown>)[field.key] ?? field.default;
}

function setValue(config: ConfigData, field: OptionField, value: unknown): ConfigData {
  if (field.configPath && field.configPath.length > 0) {
    const newConfig = JSON.parse(JSON.stringify(config));
    let obj: any = newConfig;
    for (let i = 0; i < field.configPath.length - 1; i++) {
      obj[field.configPath[i]] = obj[field.configPath[i]] || {};
      obj = obj[field.configPath[i]];
    }
    obj[field.configPath[field.configPath.length - 1]] = value;
    return newConfig;
  }
  return { ...config, [field.key]: value };
}

export default function OptionsTab({ message: _propsMessage, showMessage: _propsShowMessage, setIsTextInputFocused: _propsSetTextInputFocused }: { message: string | null; showMessage: (msg: string) => void; setIsTextInputFocused: (focused: boolean) => void }) {
  const [config, setConfig] = React.useState<ConfigData | null>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [editMode, setEditMode] = React.useState(false);
  const [editValue, setEditValue] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const rowRefs = React.useRef<React.RefObject<React.ComponentRef<typeof Box>>[]>([]);
  rowRefs.current = FIELDS.map((_, i) => rowRefs.current[i] || React.createRef());

  rowRefs.current.forEach((ref, i) => {
    useOnClick(ref, () => {
      setSelectedIndex(i);
      const field = FIELDS[i];
      if (config && (field.type === "boolean")) {
        const current = getValue(config, field);
        const newConfig = setValue(config, field, !current);
        setConfig(newConfig);
        saveConfig(newConfig);
        showMessage(`${field.label} = ${!current ? "on" : "off"}`);
      }
    });
  });

  React.useEffect(() => {
    loadConfig().then((c) => {
      setConfig(c);
      setLoading(false);
    });
  }, []);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  useInput((input, key) => {
    if (editMode) {
      if (key.return) {
        const field = FIELDS[selectedIndex];
        if (config && field) {
          let value: unknown = editValue;
          if (field.type === "number") value = editValue ? Number(editValue) : null;
          else if (field.type === "string" || field.type === "password") value = editValue || null;
          const newConfig = setValue(config, field, value);
          setConfig(newConfig);
          saveConfig(newConfig);
          showMessage(`${field.label} saved`);
        }
        setEditMode(false);
        setEditValue("");
      } else if (input === "\u0003" || key.escape) {
        setEditMode(false);
        setEditValue("");
      }
      return;
    }

    if (input === "k" || key.upArrow) {
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (input === "j" || key.downArrow) {
      setSelectedIndex((prev) => Math.min(prev + 1, FIELDS.length - 1));
    } else if (key.return) {
      const field = FIELDS[selectedIndex];
      if (!config || !field) return;
      if (field.type === "boolean") {
        const current = getValue(config, field);
        const newConfig = setValue(config, field, !current);
        setConfig(newConfig);
        saveConfig(newConfig);
        showMessage(`${field.label} = ${!current ? "on" : "off"}`);
      } else {
        const current = getValue(config, field);
        setEditValue(current !== null && current !== undefined ? String(current) : "");
        setEditMode(true);
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box paddingTop={1}>
          <Text color={theme.textMuted}>Loading options...</Text>
        </Box>
      </Box>
    );
  }

  if (!config) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box paddingTop={1}>
          <Text color={theme.textMuted}>Failed to load config</Text>
        </Box>
      </Box>
    );
  }

  let lastSection = "";

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box>
            <Text color={theme.text} bold>Options</Text>
            <Text> {" │ "} </Text>
            <Text color={theme.textMuted}>{FIELDS.length} settings</Text>
          </Box>
          <Box>
            <Text color={theme.textMuted}>j/k navigate │ Enter edit/toggle │ Ctrl+C cancel</Text>
          </Box>
        </Box>
      </Box>

      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        {FIELDS.map((field, i) => {
          const isSelected = selectedIndex === i && !editMode;
          const isEditing = editMode && selectedIndex === i;
          const value = getValue(config, field);
          const isDefault = value === field.default;
          const isSectionHeader = field.section !== lastSection;

          if (isSectionHeader) {
            lastSection = field.section;
          }

          if (isEditing && (field.type === "string" || field.type === "number" || field.type === "password")) {
            return (
              <React.Fragment key={field.key}>
                {isSectionHeader && (
                  <Box marginTop={1}>
                    <Text color={theme.accent} bold>{field.section}</Text>
                  </Box>
                )}
                <Box ref={rowRefs.current[i]}>
                  <Text color={theme.warning} bold>{field.label}</Text>
                  <Text> {" "} </Text>
                  <TextInput
                    value={editValue}
                    onChange={setEditValue}
                    focus
                  />
                </Box>
                <Box marginLeft={2}>
                  <Text color={theme.textMuted}>{field.description}</Text>
                </Box>
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={field.key}>
              {isSectionHeader && (
                <Box marginTop={1}>
                  <Text color={theme.accent} bold>{field.section}</Text>
                </Box>
              )}
              <Box ref={rowRefs.current[i]} backgroundColor={isSelected ? theme.selected : undefined}>
                <Text color={isSelected ? theme.selectedText : theme.text} bold={isSelected}>
                  {isSelected ? "▸ " : "  "}
                </Text>
                <Text color={isSelected ? theme.selectedText : theme.text} bold={isSelected}>
                  {field.label}
                </Text>
                <Text> {" "} </Text>
                <Text color={isSelected ? theme.selectedText : !isDefault ? theme.success : theme.textMuted}>
                  {formatValue(value, field.type) || <Text color={isSelected ? theme.selectedText : theme.textMuted}>&lt;default&gt;</Text>}
                </Text>
                {isSelected && (
                  <>
                    <Text> {" "} </Text>
                    <Text color={theme.selectedText}>
                      {field.type === "boolean" ? "[toggle]" : "[edit]"}
                    </Text>
                  </>
                )}
              </Box>
              <Box marginLeft={4}>
                <Text color={theme.textMuted}>{field.description}</Text>
                {field.default !== undefined && (
                  <>
                    <Text> {" | default: "}</Text>
                    <Text color={theme.textMuted}>{formatValue(field.default, field.type) || "<null>"}</Text>
                  </>
                )}
              </Box>
            </React.Fragment>
          );
        })}
      </Box>

      {message && (
        <Box marginTop={1}>
          <Text color={theme.success}>{` › ${message}`}</Text>
        </Box>
      )}
    </Box>
  );
}
