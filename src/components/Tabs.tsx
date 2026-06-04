import { useEffect, useRef } from "react";
import { Text, Box } from "ink";
import { useOnClick } from "@ink-tools/ink-mouse";
import { theme } from "../lib/theme.js";

interface Props {
  tabs: readonly string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

const FUNC_KEY_SEQS: Record<string, number> = {
  '\x1bOP': 0, '\x1b[P': 0, '\x1b[11~': 0, '\x1b[[A': 0,
  '\x1bOQ': 1, '\x1b[Q': 1, '\x1b[12~': 1, '\x1b[[B': 1,
  '\x1bOR': 2, '\x1b[R': 2, '\x1b[13~': 2, '\x1b[[C': 2,
  '\x1bOS': 3, '\x1b[S': 3, '\x1b[14~': 3, '\x1b[[D': 3,
  '\x1b[15~': 4, '\x1b[[E': 4,
};

const ESC = '\x1b';

export default function Tabs({ tabs, selectedIndex, onChange }: Props) {
  const bufferRef = useRef('');

  useEffect(() => {
    const onData = (chunk: Buffer) => {
      bufferRef.current += chunk.toString();
      let buf = bufferRef.current;
      bufferRef.current = '';
      let i = 0;
      while (i < buf.length) {
        if (buf[i] === ESC) {
          const end = Math.min(i + 12, buf.length);
          let seq = buf.substring(i, end);
          while (FUNC_KEY_SEQS[seq] === undefined && seq.length < 12) {
            break;
          }
          if (FUNC_KEY_SEQS[seq] !== undefined) {
            onChange(FUNC_KEY_SEQS[seq]);
            i += seq.length;
            continue;
          }
        }
        i++;
      }
    };
    process.stdin.on('data', onData);
    return () => {
      process.stdin.removeListener('data', onData);
    };
  }, [onChange]);

  return (
    <Box>
      {tabs.map((tab, i) => {
        const isActive = i === selectedIndex;
        const ref = useRef(null);

        useOnClick(ref, () => {
          onChange(i);
        });

        return (
          <Box key={tab} ref={ref}>
            <Text color={isActive ? theme.accent : theme.textMuted} bold={isActive}>
              {isActive ? "▸ " : "  "}{`F${i + 1} ${tab}`}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
