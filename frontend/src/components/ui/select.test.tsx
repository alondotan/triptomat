import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./select";

// Radix portals into document.body — need to query on document level
describe("Select", () => {
  it("renders trigger with placeholder", () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Option A</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("trigger has combobox role", () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="x">X</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("does not show options when closed", () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
          <SelectItem value="b">Beta</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("shows selected value", () => {
    render(
      <Select defaultValue="b">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
          <SelectItem value="b">Beta</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("trigger can be disabled", () => {
    render(
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Disabled" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("trigger merges custom className", () => {
    render(
      <Select>
        <SelectTrigger className="my-trigger">
          <SelectValue placeholder="Styled" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByRole("combobox").className).toContain("my-trigger");
  });

  it("SelectContent has z-[1200] for proper stacking above dialogs (z-[1100])", () => {
    // Key z-index test: SelectContent must stack above Dialog (z-[1100]).
    render(
      <Select open>
        <SelectTrigger>
          <SelectValue placeholder="Open" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>,
    );
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();
    // The content wrapper should have z-[1200] class
    const contentEl = listbox.closest("[class*='z-']");
    expect(contentEl?.className).toContain("z-[1200]");
  });

  it("calls onValueChange when selecting", () => {
    const onChange = vi.fn();
    render(
      <Select open onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
          <SelectItem value="b">Beta</SelectItem>
        </SelectContent>
      </Select>,
    );
    fireEvent.click(screen.getByText("Alpha"));
    expect(onChange).toHaveBeenCalledWith("a");
  });
});
