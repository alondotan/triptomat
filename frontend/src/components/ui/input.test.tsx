import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { Input } from "./input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter text").tagName).toBe("INPUT");
  });

  it("applies text type by default", () => {
    render(<Input data-testid="inp" />);
    // Default HTML input type is text when not specified
    expect(screen.getByTestId("inp")).not.toHaveAttribute("type");
  });

  it("supports different input types", () => {
    render(<Input type="email" data-testid="email-inp" />);
    expect(screen.getByTestId("email-inp")).toHaveAttribute("type", "email");
  });

  it("handles value changes", () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} placeholder="type here" />);
    fireEvent.change(screen.getByPlaceholderText("type here"), {
      target: { value: "hello" },
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("can be disabled", () => {
    render(<Input disabled placeholder="disabled" />);
    expect(screen.getByPlaceholderText("disabled")).toBeDisabled();
  });

  it("merges custom className", () => {
    render(<Input className="extra-class" data-testid="inp" />);
    const el = screen.getByTestId("inp");
    expect(el.className).toContain("extra-class");
    expect(el.className).toContain("rounded-md");
  });

  it("forwards ref", () => {
    const ref = vi.fn();
    render(<Input ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  it("supports readonly attribute", () => {
    render(<Input readOnly value="fixed" data-testid="ro" />);
    expect(screen.getByTestId("ro")).toHaveAttribute("readonly");
  });
});
