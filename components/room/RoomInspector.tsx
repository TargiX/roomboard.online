"use client";

import type { CSSProperties, FormEvent } from "react";
import {
  Copy,
  Download,
  FileImage,
  FileText,
  Link2,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type {
  RoomActivity,
  RoomConnection,
  RoomItem,
  RoomItemStatus,
  RoomItemStyleVariant,
  RoomRecap,
  RoomRecapSection,
} from "@/lib/canvasRoom";
import { isDecisionSignalOwnedByUser, type LocalUser } from "./roomTypes";
export type InspectorDraft = {
  body: string;
  imageUrl: string;
  status: RoomItemStatus;
  title: string;
};

export type InspectorRecap = {
  copied: boolean;
  exported: boolean;
  isExporting: boolean;
  isLoading: boolean;
  recap: RoomRecap | null;
  sections: RoomRecapSection[];
};

type RoomInspectorProps = {
  activities: {
    board: RoomActivity[];
    selected: RoomActivity[];
  };
  canEditRoom: boolean;
  comment: string;
  connections: RoomConnection[];
  draft: InspectorDraft;
  items: RoomItem[];
  recap: InspectorRecap;
  selected: RoomItem | null;
  user: LocalUser | null;
  actions: {
    copyRoomRecap: () => void | Promise<void>;
    deleteConnection: (connectionId: string) => void | Promise<void>;
    deleteItem: (itemId: string) => void | Promise<void>;
    duplicateItem: (itemId: string) => void | Promise<void>;
    exportRoomRecap: () => void | Promise<void>;
    loadRoomRecap: () => void | Promise<unknown>;
    patchItem: (input: { color?: string; id: string; styleVariant?: RoomItemStyleVariant }) => Promise<void>;
    reverseConnection: (connectionId: string) => void | Promise<void>;
    saveSelected: () => void | Promise<void>;
    selectItem: (itemId: string) => void;
    setComment: (value: string) => void;
    setDraft: (patch: Partial<InspectorDraft>) => void;
    submitComment: (event: FormEvent<HTMLFormElement>) => void;
    toggleDecisionSignal: (item: RoomItem) => void | Promise<void>;
    updateSelectedStatus: (status: RoomItemStatus) => void | Promise<void>;
  };
  helpers: {
    activityList: (props: { activities: RoomActivity[]; empty: string }) => React.ReactNode;
    getDomain: (url?: string) => string;
    getInitials: (name: string) => string;
    statusMeta: (status: RoomItemStatus) => { color: string; label: string; short: string };
    statusOptions: Array<{ label: string; status: RoomItemStatus }>;
    truncate: (value: string, length?: number) => string;
  };
  palette: { colors: string[] };
};

export function RoomInspector({
  actions,
  activities,
  canEditRoom,
  comment,
  connections,
  draft,
  helpers,
  items,
  palette,
  recap,
  selected,
  user,
}: RoomInspectorProps) {
  const selectedConnections = selected
    ? connections.filter((connection) => connection.from === selected.id || connection.to === selected.id)
    : [];

  return (
    <aside className={`rb-inspector ${selected ? "" : "empty board"}`} aria-label="Selected item details">
      <div className="rb-inspector__head">
        <span className="rb-inspector__type">
          <span className="presence-dot" style={{ background: selected?.color ?? "var(--accent)" }} />
          {selected ? selected.type : "Board"}
        </span>
        <button
          aria-label="Close inspector"
          className="rb-inspector__close"
          disabled={!selected}
          onClick={() => actions.selectItem("")}
          type="button"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {selected ? (
        <div className="rb-inspector__body">
          <div className="rb-field">
            <label className="rb-field__label" htmlFor="room-title">
              Title
            </label>
            <input
              className="rb-input"
              id="room-title"
              onBlur={() => canEditRoom && void actions.saveSelected()}
              onChange={(event) => actions.setDraft({ title: event.target.value })}
              readOnly={!canEditRoom}
              value={draft.title}
            />
          </div>

          <div className="rb-field">
            <span className="rb-field__label">Color</span>
            <div className="rb-color-swatches">
              {palette.colors.map((c) => (
                <button
                  aria-label={`Set color ${c}`}
                  className={`rb-color-swatch ${selected.color === c ? "selected" : ""}`}
                  disabled={!canEditRoom}
                  key={c}
                  onClick={() => void actions.patchItem({ color: c, id: selected.id })}
                  style={{ backgroundColor: c }}
                  type="button"
                />
              ))}
            </div>
          </div>

          <div className="rb-field">
            <span className="rb-field__label">Card Style</span>
            <div className="rb-status-segmented" role="group" aria-label="Card style">
              <button
                aria-pressed={selected.styleVariant !== "highlight"}
                className={selected.styleVariant !== "highlight" ? "selected" : ""}
                disabled={!canEditRoom}
                onClick={() => void actions.patchItem({ id: selected.id, styleVariant: "minimal" })}
                type="button"
              >
                Minimal
              </button>
              <button
                aria-pressed={selected.styleVariant === "highlight"}
                className={selected.styleVariant === "highlight" ? "selected" : ""}
                disabled={!canEditRoom}
                onClick={() => void actions.patchItem({ id: selected.id, styleVariant: "highlight" })}
                type="button"
              >
                Highlight
              </button>
            </div>
          </div>

          <div className="rb-field">
            <span className="rb-field__label">Decision status</span>
            <div className="rb-status-segmented" role="group" aria-label="Decision status">
              {helpers.statusOptions.map((option) => {
                const meta = helpers.statusMeta(option.status);
                return (
                  <button
                    aria-pressed={draft.status === option.status}
                    className={draft.status === option.status ? "selected" : ""}
                    disabled={!canEditRoom}
                    key={option.status}
                    onClick={() => void actions.updateSelectedStatus(option.status)}
                    style={{ "--status-color": meta.color } as CSSProperties}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rb-field">
            <label className="rb-field__label" htmlFor="room-body">
              Notes
            </label>
            <textarea
              className="rb-input"
              id="room-body"
              onBlur={() => canEditRoom && void actions.saveSelected()}
              onChange={(event) => actions.setDraft({ body: event.target.value })}
              readOnly={!canEditRoom}
              rows={4}
              value={draft.body}
            />
          </div>

          {selected.type === "image" ? (
            <div className="rb-field">
              <label className="rb-field__label" htmlFor="room-image-url">
                Image link
              </label>
              <input
                className="rb-input"
                id="room-image-url"
                onBlur={() => canEditRoom && void actions.saveSelected()}
                onChange={(event) => actions.setDraft({ imageUrl: event.target.value })}
                placeholder="Enter image URL"
                readOnly={!canEditRoom}
                value={draft.imageUrl}
              />
              {selected.imageUrl ? (
                <>
                  <div className="rb-image-meta">
                    <span className="rb-image-meta__copy">
                      <span className="rb-image-meta__domain">{helpers.getDomain(selected.imageUrl)}</span>
                      <span className="rb-image-meta__detail">
                        {selected.comments.length > 0
                          ? `${selected.comments.length} review note${selected.comments.length === 1 ? "" : "s"}`
                          : "Source saved"}
                      </span>
                    </span>
                    <a href={selected.imageUrl} rel="noreferrer" target="_blank">
                      <Link2 size={11} aria-hidden="true" />
                      Open source
                    </a>
                  </div>
                  <div className="rb-image-preview">
                    <img alt={selected.title} src={selected.imageUrl} />
                  </div>
                </>
              ) : (
                <div className="rb-image-empty">
                  <FileImage size={16} aria-hidden="true" />
                  <span>No image source yet</span>
                  <small>Paste a URL above or upload a reference from the toolbar.</small>
                </div>
              )}
            </div>
          ) : null}

          <div className="rb-inspector__section">
            <div className="rb-inspector__section-title">
              Connections <span className="count">{selectedConnections.length}</span>
            </div>
            {selectedConnections.length > 0 ? (
              selectedConnections.map((connection) => {
                const otherId = connection.from === selected.id ? connection.to : connection.from;
                const otherItem = items.find((item) => item.id === otherId);
                const relation = connection.from === selected.id ? "to" : "from";

                return (
                  <div className="rb-conn-row" key={connection.id}>
                    <Link2 size={12} aria-hidden="true" />
                    <span className="name">{otherItem ? helpers.truncate(otherItem.title, 24) : "Unknown card"}</span>
                    <span className="type">{relation}</span>
                    <div className="rb-conn-actions">
                      <button
                        aria-label="Reverse connection"
                        disabled={!canEditRoom}
                        onClick={() => void actions.reverseConnection(connection.id)}
                        type="button"
                      >
                        <RefreshCw size={12} aria-hidden="true" />
                      </button>
                      <button
                        aria-label="Delete connection"
                        disabled={!canEditRoom}
                        onClick={() => void actions.deleteConnection(connection.id)}
                        type="button"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="rb-empty-copy">No connections yet.</p>
            )}
          </div>

          <div className="rb-inspector__section">
            <div className="rb-inspector__section-title">
              Comments <span className="count">{selected.comments.length}</span>
            </div>
            {selected.comments.length > 0 ? (
              selected.comments.map((entry) => (
                <div className="rb-comment" key={entry.id}>
                  <div className="rb-comment__head">
                    <span className="rb-comment__avatar" style={{ background: entry.color }}>
                      {helpers.getInitials(entry.author)}
                    </span>
                    <span className="rb-comment__name">{entry.author}</span>
                  </div>
                  <div className="rb-comment__body">{entry.body}</div>
                </div>
              ))
            ) : (
              <p className="rb-empty-copy">No comments yet.</p>
            )}
            <form className="rb-comment-compose" onSubmit={actions.submitComment}>
              <input
                aria-label="Add comment"
                disabled={!canEditRoom}
                onChange={(event) => actions.setComment(event.target.value)}
                placeholder="Add a comment"
                value={comment}
              />
              <button disabled={!canEditRoom || comment.trim().length === 0} type="submit">
                <Send size={13} aria-hidden="true" />
              </button>
            </form>
          </div>

          <div className="rb-inspector__section">
            <div className="rb-inspector__section-title">
              Decision signals <span className="count">{selected.decisionSignals?.length ?? 0}</span>
            </div>
            <p className="rb-empty-copy">
              {(selected.decisionSignals?.length ?? 0) > 0
                ? `${selected.decisionSignals!.map((signal) => signal.voter).join(", ")} back${selected.decisionSignals!.length === 1 ? "s" : ""} this direction.`
                : "Ask editors to back the option they want to move forward."}
            </p>
            <button
              className="rb-btn sm"
              disabled={!canEditRoom}
              onClick={() => void actions.toggleDecisionSignal(selected)}
              type="button"
            >
              {selected.decisionSignals?.some((signal) => isDecisionSignalOwnedByUser(signal, user))
                ? "Remove my signal"
                : "I back this"}
            </button>
          </div>

          <div className="rb-inspector__section">
            <div className="rb-inspector__section-title">
              Activity <span className="count">{activities.selected.length}</span>
            </div>
            {helpers.activityList({ activities: activities.selected, empty: "No activity for this card yet." })}
          </div>

          <div className="rb-recap-actions">
            <button
              className="rb-btn sm"
              disabled={!canEditRoom}
              onClick={() => void actions.duplicateItem(selected.id)}
              type="button"
            >
              <Copy size={12} aria-hidden="true" />
              Duplicate card
            </button>
          </div>

          <div className="rb-inspector__danger">
            <button
              className="rb-btn danger-line"
              disabled={!canEditRoom}
              onClick={() => void actions.deleteItem(selected.id)}
              type="button"
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete card
            </button>
          </div>
        </div>
      ) : (
        <div className="rb-inspector__body">
          <MessageSquarePlus size={22} aria-hidden="true" />
          <h2>Nothing selected</h2>
          <p>Select a note or image to inspect details, links, and comments.</p>
          <div className="rb-inspector__section rb-recap-section">
            <div className="rb-inspector__section-title">
              Recap{" "}
              <span className="count">
                {recap.recap ? `${recap.recap.decidedCount}/${recap.recap.totalItems}` : "new"}
              </span>
            </div>
            {recap.recap ? (
              <div className="rb-recap">
                <div className="rb-recap-summary" aria-label="Decision recap">
                  <div>
                    <strong>
                      {recap.recap.decidedCount}/{recap.recap.totalItems}
                    </strong>
                    <span>decided</span>
                  </div>
                  <div>
                    <strong>{recap.recap.unresolvedCount}</strong>
                    <span>unresolved</span>
                  </div>
                  <div>
                    <strong>{recap.recap.commentCount}</strong>
                    <span>comments</span>
                  </div>
                </div>
                {recap.sections.length > 0 ? (
                  <div className="rb-recap-groups">
                    {recap.sections.map((section) => (
                      <div className={`rb-recap-group status-${section.status}`} key={section.status}>
                        <div className="rb-recap-group__head">
                          <span>{section.label}</span>
                          <strong>{section.count}</strong>
                        </div>
                        {section.items.slice(0, 2).map((item) => (
                          <div className="rb-recap-item" key={item.id}>
                            <span>{item.title}</span>
                            <small>
                              {item.type}
                              {item.commentCount > 0 ? ` / ${item.commentCount} comments` : ""}
                            </small>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rb-empty-copy">No cards yet.</p>
                )}
                <div className="rb-recap-actions">
                  <button
                    className="rb-btn sm"
                    disabled={recap.isLoading}
                    onClick={() => void actions.loadRoomRecap()}
                    type="button"
                  >
                    <RefreshCw size={12} aria-hidden="true" />
                    {recap.isLoading ? "Refreshing" : "Refresh"}
                  </button>
                  <button className="rb-btn primary sm" onClick={() => void actions.copyRoomRecap()} type="button">
                    <Copy size={12} aria-hidden="true" />
                    {recap.copied ? "Copied" : "Copy recap"}
                  </button>
                  <button
                    className="rb-btn sm"
                    disabled={recap.isExporting}
                    onClick={() => void actions.exportRoomRecap()}
                    type="button"
                  >
                    <Download size={12} aria-hidden="true" />
                    {recap.exported ? "Exported" : "Export .md"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rb-recap-empty">
                <FileText size={18} aria-hidden="true" />
                <button
                  className="rb-btn primary sm"
                  disabled={recap.isLoading}
                  onClick={() => void actions.loadRoomRecap()}
                  type="button"
                >
                  {recap.isLoading ? "Generating" : "Generate recap"}
                </button>
              </div>
            )}
          </div>
          <div className="rb-inspector__section">
            <div className="rb-inspector__section-title">
              Activity <span className="count">{activities.board.length}</span>
            </div>
            {helpers.activityList({ activities: activities.board, empty: "No room activity yet." })}
          </div>
        </div>
      )}
    </aside>
  );
}
