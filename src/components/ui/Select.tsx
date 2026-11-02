import React from "react";
import SelectComponent, {
  components as selectComponents,
  type DropdownIndicatorProps,
} from "react-select";
import CreatableSelect from "react-select/creatable";
import type {
  ActionMeta,
  Props as ReactSelectProps,
  SingleValue,
  StylesConfig,
} from "react-select";

export type SelectOption = {
  value: string;
  label: string;
  isDisabled?: boolean;
};

type BaseProps = {
  value: string | null;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  isClearable?: boolean;
  onChange: (value: string | null, action: ActionMeta<SelectOption>) => void;
  onBlur?: () => void;
  className?: string;
  formatCreateLabel?: (input: string) => string;
};

type CreatableProps = {
  isCreatable: true;
  onCreateOption: (value: string) => void;
};

type NonCreatableProps = {
  isCreatable?: false;
  onCreateOption?: never;
};

export type SelectProps = BaseProps & (CreatableProps | NonCreatableProps);

// Matches Dropdown: a glass trigger at the control radius, a glass popover
// that pops open, Dropdown's hover and selected rows, our focus ring.
const focusRing =
  "0 0 0 2px color-mix(in srgb, var(--color-logo-primary) 25%, transparent)";

const selectStyles: StylesConfig<SelectOption, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: "var(--spacing-control)",
    borderRadius: "var(--radius-control)",
    border: "0.5px solid var(--glass-edge)",
    borderColor: "var(--glass-edge)",
    outline: "none",
    boxShadow: state.isFocused
      ? `var(--shadow-card), ${focusRing}`
      : "var(--shadow-card)",
    backgroundColor: "var(--glass-strong)",
    fontSize: "var(--text-ui)",
    fontWeight: 400,
    color: "var(--color-text)",
    cursor: state.isDisabled ? "not-allowed" : "pointer",
    opacity: state.isDisabled ? 0.5 : 1,
    transition: "background-color 150ms ease, box-shadow 150ms ease",
    ":hover": {
      backgroundColor: "var(--glass)",
      borderColor: "var(--glass-edge)",
    },
  }),
  valueContainer: (base) => ({
    ...base,
    paddingInline: 12,
    paddingBlock: 0,
  }),
  input: (base) => ({
    ...base,
    margin: 0,
    paddingBlock: 0,
    color: "var(--color-text)",
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--color-text)",
  }),
  indicatorSeparator: () => ({ display: "none" }),
  dropdownIndicator: (base, state) => ({
    ...base,
    paddingBlock: 0,
    paddingInline: 10,
    color: "var(--color-ink-3)",
    transition: "transform 300ms var(--spring)",
    transform: state.selectProps.menuIsOpen ? "rotate(180deg)" : undefined,
    ":hover": {
      color: "var(--color-ink-3)",
    },
  }),
  clearIndicator: (base) => ({
    ...base,
    paddingBlock: 0,
    paddingInline: 4,
    color: "var(--color-ink-3)",
    ":hover": {
      color: "var(--color-text)",
    },
  }),
  loadingIndicator: (base) => ({
    ...base,
    color: "var(--color-ink-3)",
  }),
  menu: (base) => ({
    ...base,
    zIndex: 30,
    marginTop: 6,
    marginBottom: 6,
    borderRadius: "var(--radius-card)",
    backgroundColor: "var(--glass-strong)",
    border: "0.5px solid var(--glass-edge)",
    boxShadow: "var(--shadow-pop)",
    overflow: "hidden",
    color: "var(--color-text)",
  }),
  menuList: (base) => ({
    ...base,
    padding: 4,
    maxHeight: 240,
  }),
  option: (base, state) => ({
    ...base,
    borderRadius: "var(--radius-tip)",
    paddingBlock: 6,
    paddingInline: 10,
    fontSize: "var(--text-ui)",
    fontWeight: state.isSelected ? 450 : 400,
    backgroundColor: state.isSelected
      ? "var(--glass-press)"
      : state.isFocused
        ? "var(--glass-hover)"
        : "transparent",
    color: "var(--color-text)",
    cursor: state.isDisabled ? "not-allowed" : "pointer",
    opacity: state.isDisabled ? 0.5 : 1,
    ":active": {
      backgroundColor: "var(--glass-press)",
    },
  }),
  noOptionsMessage: (base) => ({
    ...base,
    fontSize: "var(--text-small)",
    color: "var(--color-ink-3)",
  }),
  loadingMessage: (base) => ({
    ...base,
    fontSize: "var(--text-small)",
    color: "var(--color-ink-3)",
  }),
  placeholder: (base) => ({
    ...base,
    color: "var(--color-ink-3)",
  }),
  multiValue: (base) => ({
    ...base,
    borderRadius: 999,
    backgroundColor: "var(--glass-press)",
  }),
  multiValueLabel: (base) => ({
    ...base,
    fontSize: "var(--text-small)",
    color: "var(--color-text)",
    paddingInline: 8,
  }),
  multiValueRemove: (base) => ({
    ...base,
    borderRadius: 999,
    color: "var(--color-ink-3)",
    ":hover": {
      backgroundColor: "var(--glass-hover)",
      color: "var(--color-text)",
    },
  }),
};

// Dropdown's thin chevron in place of react-select's heavier default.
const DropdownIndicator = (
  props: DropdownIndicatorProps<SelectOption, false>,
) => (
  <selectComponents.DropdownIndicator {...props}>
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  </selectComponents.DropdownIndicator>
);

export const Select: React.FC<SelectProps> = React.memo(
  ({
    value,
    options,
    placeholder,
    disabled,
    isLoading,
    isClearable = true,
    onChange,
    onBlur,
    className = "",
    isCreatable,
    formatCreateLabel,
    onCreateOption,
  }) => {
    const selectValue = React.useMemo(() => {
      if (!value) return null;
      const existing = options.find((option) => option.value === value);
      if (existing) return existing;
      return { value, label: value, isDisabled: false };
    }, [value, options]);

    const handleChange = (
      option: SingleValue<SelectOption>,
      action: ActionMeta<SelectOption>,
    ) => {
      onChange(option?.value ?? null, action);
    };

    const sharedProps: Partial<ReactSelectProps<SelectOption, false>> = {
      className,
      classNamePrefix: "app-select",
      value: selectValue,
      options,
      onChange: handleChange,
      placeholder,
      isDisabled: disabled,
      isLoading,
      onBlur,
      isClearable,
      styles: selectStyles,
      components: { DropdownIndicator },
      classNames: {
        menu: () => "glass-strong animate-menu-pop origin-top",
      },
    };

    if (isCreatable) {
      return (
        <CreatableSelect<SelectOption, false>
          {...sharedProps}
          onCreateOption={onCreateOption}
          formatCreateLabel={formatCreateLabel}
        />
      );
    }

    return <SelectComponent<SelectOption, false> {...sharedProps} />;
  },
);

Select.displayName = "Select";
