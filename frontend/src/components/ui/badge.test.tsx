import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>Test Badge</Badge>);
    expect(screen.getByText("Test Badge")).toBeInTheDocument();
  });

  it("renders as a div element", () => {
    render(<Badge>Content</Badge>);
    expect(screen.getByText("Content").tagName).toBe("DIV");
  });

  it("applies default variant classes", () => {
    render(<Badge>Default</Badge>);
    const el = screen.getByText("Default");
    expect(el.className).toContain("bg-primary");
    expect(el.className).toContain("text-primary-foreground");
  });

  it("applies secondary variant classes", () => {
    render(<Badge variant="secondary">Secondary</Badge>);
    const el = screen.getByText("Secondary");
    expect(el.className).toContain("bg-secondary");
  });

  it("applies destructive variant classes", () => {
    render(<Badge variant="destructive">Destructive</Badge>);
    const el = screen.getByText("Destructive");
    expect(el.className).toContain("bg-destructive");
  });

  it("applies outline variant classes", () => {
    render(<Badge variant="outline">Outline</Badge>);
    const el = screen.getByText("Outline");
    expect(el.className).toContain("text-foreground");
    expect(el.className).not.toContain("bg-primary");
  });

  it("merges custom className", () => {
    render(<Badge className="custom-class">Custom</Badge>);
    const el = screen.getByText("Custom");
    expect(el.className).toContain("custom-class");
    expect(el.className).toContain("rounded-full");
  });

  it("passes through HTML attributes", () => {
    render(<Badge data-testid="my-badge" role="status">Status</Badge>);
    expect(screen.getByTestId("my-badge")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Status");
  });
});
