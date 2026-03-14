import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("renders as button element by default", () => {
    render(<Button>Btn</Button>);
    expect(screen.getByRole("button").tagName).toBe("BUTTON");
  });

  it("fires onClick handler", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("can be disabled", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Disabled</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies default variant and size classes", () => {
    render(<Button>Default</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-primary");
    expect(btn.className).toContain("h-10");
  });

  it("applies destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole("button").className).toContain("bg-destructive");
  });

  it("applies outline variant", () => {
    render(<Button variant="outline">Outline</Button>);
    expect(screen.getByRole("button").className).toContain("border");
  });

  it("applies ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).not.toContain("bg-primary");
    expect(cls).not.toContain("border");
  });

  it("applies sm size", () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole("button").className).toContain("h-9");
  });

  it("applies lg size", () => {
    render(<Button size="lg">Large</Button>);
    expect(screen.getByRole("button").className).toContain("h-11");
  });

  it("applies icon size", () => {
    render(<Button size="icon">X</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("h-10");
    expect(cls).toContain("w-10");
  });

  it("merges custom className", () => {
    render(<Button className="my-custom">Custom</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("my-custom");
    expect(cls).toContain("inline-flex");
  });

  it("renders as child element when asChild is true", () => {
    render(
      <Button asChild>
        <a href="/link">Link Button</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Link Button" });
    expect(link.tagName).toBe("A");
    expect(link.className).toContain("bg-primary");
  });

  it("forwards ref", () => {
    const ref = vi.fn();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });

  it("supports type attribute", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});
