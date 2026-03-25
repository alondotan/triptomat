import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import type { PointOfInterest } from "@/types/trip";

// Mock dependencies
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/context/POIContext", () => ({
  usePOI: () => ({ updatePOI: vi.fn() }),
  POIContext: { Provider: ({ children }: { children: unknown }) => children },
}));

vi.mock("@/hooks/useResearchAutoAssign", () => ({
  useResearchAutoAssign: () => ({ autoAssign: vi.fn(), isResearchMode: false }),
}));

vi.mock("@/lib/subCategoryConfig", () => ({
  getSubCategoryEntry: () => ({ icon: "restaurant" }),
  getSubCategoryLabel: (sub: string) => sub,
}));

vi.mock("../shared/SubCategoryIcon", () => ({
  SubCategoryIcon: ({ type }: { type: string }) => (
    <span data-testid="subcategory-icon">{type}</span>
  ),
}));

vi.mock("./POIDetailDialog", () => ({
  POIDetailDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="poi-dialog">Dialog</div> : null,
}));

import { POICard } from "./POICard";

function makePOI(overrides: Partial<PointOfInterest> = {}): PointOfInterest {
  return {
    id: "poi-1",
    tripId: "trip-1",
    category: "eatery",
    subCategory: "restaurant",
    name: "Test Restaurant",
    status: "suggested",
    location: { city: "Tokyo", country: "Japan" },
    sourceRefs: { email_ids: [], recommendation_ids: [] },
    details: {
      activity_details: { duration: 60 },
      notes: { user_summary: "Great food" },
    },
    isCancelled: false,
    isPaid: false,
    imageUrl: "https://example.com/img.jpg",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago (not new)
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("POICard", () => {
  describe("Level 1 - icon + name only", () => {
    it("renders POI name", () => {
      render(<POICard poi={makePOI()} level={1} />);
      expect(screen.getByText("Test Restaurant")).toBeInTheDocument();
    });

    it("renders material icon when subCategory entry has icon", () => {
      render(<POICard poi={makePOI()} level={1} />);
      expect(screen.getByText("restaurant")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(
        <POICard poi={makePOI()} level={1} className="my-class" />,
      );
      expect(container.firstElementChild?.className).toContain("my-class");
    });
  });

  describe("Level 2 - compact card", () => {
    it("renders POI name", () => {
      render(<POICard poi={makePOI()} level={2} />);
      expect(screen.getByText("Test Restaurant")).toBeInTheDocument();
    });

    it("renders image when imageUrl is provided", () => {
      render(<POICard poi={makePOI()} level={2} />);
      // Level 2 image has alt="" (decorative), so query by tag
      const img = document.querySelector("img");
      expect(img).toHaveAttribute("src", "https://example.com/img.jpg");
    });

    it("shows duration when available", () => {
      render(<POICard poi={makePOI()} level={2} />);
      // 60 minutes = 1h
      expect(screen.getByText("1h")).toBeInTheDocument();
    });

    it("shows notes when available", () => {
      render(<POICard poi={makePOI()} level={2} />);
      expect(screen.getByText("Great food")).toBeInTheDocument();
    });

    it("shows 'add duration' button when editable and no duration", () => {
      const poi = makePOI({
        details: { activity_details: {}, notes: {} },
      });
      render(<POICard poi={poi} level={2} editable />);
      expect(screen.getByText("poiCard.addDuration")).toBeInTheDocument();
    });

    it("shows 'add note' button when editable and no notes", () => {
      const poi = makePOI({
        details: { activity_details: {}, notes: {} },
      });
      render(<POICard poi={poi} level={2} editable />);
      expect(screen.getByText("poiCard.addNote")).toBeInTheDocument();
    });

    it("opens dialog on card click when no onSelect", () => {
      render(<POICard poi={makePOI()} level={2} />);
      fireEvent.click(screen.getByText("Test Restaurant"));
      expect(screen.getByTestId("poi-dialog")).toBeInTheDocument();
    });

    it("calls onSelect instead of opening dialog when provided", () => {
      const onSelect = vi.fn();
      render(<POICard poi={makePOI()} level={2} onSelect={onSelect} />);
      fireEvent.click(screen.getByText("Test Restaurant"));
      expect(onSelect).toHaveBeenCalled();
      expect(screen.queryByTestId("poi-dialog")).not.toBeInTheDocument();
    });

    it("shows edit button when onSelect is provided", () => {
      render(
        <POICard poi={makePOI()} level={2} onSelect={() => {}} />,
      );
      expect(screen.getByLabelText("common.edit")).toBeInTheDocument();
    });

    it("renders add transport button when onAddTransport provided", () => {
      const onAdd = vi.fn();
      render(<POICard poi={makePOI()} level={2} onAddTransport={onAdd} />);
      const btn = screen.getByText(/poiCard.addTransport/);
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(onAdd).toHaveBeenCalled();
    });

    it("applies selected ring when isSelected", () => {
      render(
        <POICard poi={makePOI()} level={2} isSelected onSelect={() => {}} />,
      );
      const imgButton = screen.getByLabelText("poiCard.enlargeImage");
      expect(imgButton.className).toContain("ring-2");
    });
  });

  describe("Level 3 - full tile", () => {
    it("renders POI name and city", () => {
      render(<POICard poi={makePOI()} level={3} />);
      expect(screen.getByText("Test Restaurant")).toBeInTheDocument();
      expect(screen.getByText("Tokyo")).toBeInTheDocument();
    });

    it("renders image", () => {
      render(<POICard poi={makePOI()} level={3} />);
      const img = screen.getByRole("img", { name: "Test Restaurant" });
      expect(img).toBeInTheDocument();
    });

    it("renders subcategory icon fallback when no image", () => {
      const poi = makePOI({ imageUrl: undefined });
      render(<POICard poi={poi} level={3} />);
      // Without image, SubCategoryIcon should be in the placeholder
      const icons = screen.getAllByTestId("subcategory-icon");
      expect(icons.length).toBeGreaterThan(0);
    });

    it("renders heart/favorite button", () => {
      render(<POICard poi={makePOI()} level={3} />);
      expect(screen.getByLabelText("poiCard.favorite")).toBeInTheDocument();
    });

    it("shows 'new' badge for recently created POIs", () => {
      const poi = makePOI({
        createdAt: new Date().toISOString(), // just now
      });
      render(<POICard poi={poi} level={3} />);
      expect(screen.getByText("common.new")).toBeInTheDocument();
    });

    it("does not show 'new' badge for old POIs", () => {
      render(<POICard poi={makePOI()} level={3} />);
      expect(screen.queryByText("common.new")).not.toBeInTheDocument();
    });

    it("applies opacity when cancelled", () => {
      const poi = makePOI({ isCancelled: true });
      const { container } = render(<POICard poi={poi} level={3} />);
      const btn = container.querySelector("button");
      expect(btn?.className).toContain("opacity-50");
    });

    it("opens dialog on tile click", () => {
      render(<POICard poi={makePOI()} level={3} />);
      fireEvent.click(screen.getByText("Test Restaurant"));
      expect(screen.getByTestId("poi-dialog")).toBeInTheDocument();
    });

    it("renders subcategory label", () => {
      render(<POICard poi={makePOI()} level={3} />);
      // getSubCategoryLabel is mocked to return the subCategory itself
      // "restaurant" appears both in SubCategoryIcon mock and label span
      const labels = screen.getAllByText("restaurant");
      expect(labels.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("formatDuration", () => {
    // Test via rendering POICard level 2 with different durations
    it("shows minutes for < 60", () => {
      const poi = makePOI({ details: { activity_details: { duration: 45 } } });
      render(<POICard poi={poi} level={2} />);
      expect(screen.getByText("45'")).toBeInTheDocument();
    });

    it("shows hours for exact hours", () => {
      const poi = makePOI({ details: { activity_details: { duration: 120 } } });
      render(<POICard poi={poi} level={2} />);
      expect(screen.getByText("2h")).toBeInTheDocument();
    });

    it("shows h:mm for mixed", () => {
      const poi = makePOI({ details: { activity_details: { duration: 90 } } });
      render(<POICard poi={poi} level={2} />);
      expect(screen.getByText("1:30")).toBeInTheDocument();
    });
  });
});
