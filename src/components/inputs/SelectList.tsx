import React from "react";
import Select from "ink-select-input";
import { Box } from "ink";

interface Item {
  label: string;
  value: string;
}

interface Props {
  items: Item[];
  onSelect: (item: Item) => void;
}

export default function SelectList({ items, onSelect }: Props) {
  return (
    <Box>
      <Select
        items={items}
        onSelect={(item) => {
          const selected = items.find((i) => i.value === item.value);
          if (selected) onSelect(selected);
        }}
      />
    </Box>
  );
}
