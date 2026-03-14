import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "./dialog";

describe("Dialog", () => {
  it("does not render content when closed", () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByText("Body")).not.toBeInTheDocument();
  });

  it("renders content when open", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Dialog body text</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Dialog body text")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
  });

  it("opens when trigger is clicked", () => {
    render(
      <Dialog>
        <DialogTrigger>Open Dialog</DialogTrigger>
        <DialogContent>
          <DialogTitle>My Dialog</DialogTitle>
          <DialogDescription>Content here</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByText("Content here")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Open Dialog"));
    expect(screen.getByText("Content here")).toBeInTheDocument();
  });

  it("renders close button with sr-only text", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Desc</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Close")).toBeInTheDocument();
    expect(screen.getByText("Close")).toHaveClass("sr-only");
  });

  it("dialog overlay has z-[1100]", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Desc</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    // The overlay should have z-[1100] to stack above most content
    const overlay = document.querySelector("[data-state='open']");
    const allElements = document.querySelectorAll(".z-\\[1100\\]");
    expect(allElements.length).toBeGreaterThan(0);
  });

  it("DialogHeader renders children", () => {
    render(
      <DialogHeader data-testid="header">
        <span>Header Content</span>
      </DialogHeader>,
    );
    expect(screen.getByTestId("header")).toHaveTextContent("Header Content");
  });

  it("DialogFooter renders children", () => {
    render(
      <DialogFooter data-testid="footer">
        <button>Save</button>
      </DialogFooter>,
    );
    expect(screen.getByTestId("footer")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });
});
