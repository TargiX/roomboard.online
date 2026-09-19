"use client";

import type { RefObject } from "react";
import { FileImage, Link2, MousePointer2, StickyNote, Upload } from "lucide-react";

type RoomToolbarProps = {
  canEditRoom: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  imageUrl: string;
  isConnecting: boolean;
  actions: {
    createImageFromFile: (file: File) => void | Promise<void>;
    createImageFromUrl: (url: string) => void | Promise<void>;
    createItem: (type: "note") => void | Promise<void>;
    setConnecting: (connecting: boolean) => void;
    setImageUrl: (value: string) => void;
  };
};

export function RoomToolbar({ actions, canEditRoom, fileInputRef, imageUrl, isConnecting }: RoomToolbarProps) {
  return (
    <div className="rb-toolbar" aria-label="Canvas tools">
      <button
        className={`rb-tool ${isConnecting ? "" : "active"}`}
        onClick={() => actions.setConnecting(false)}
        type="button"
      >
        <MousePointer2 size={14} aria-hidden="true" />
        <span>Select</span>
      </button>
      <button
        aria-label="Add note"
        className="rb-tool"
        disabled={!canEditRoom}
        onClick={() => void actions.createItem("note")}
        type="button"
      >
        <StickyNote size={14} aria-hidden="true" />
        <span>Add note</span>
      </button>
      <button
        className={`rb-tool ${isConnecting ? "active" : ""}`}
        disabled={!canEditRoom}
        onClick={() => actions.setConnecting(!isConnecting)}
        type="button"
      >
        <Link2 size={14} aria-hidden="true" />
        <span>{isConnecting ? "Linking" : "Link"}</span>
      </button>
      <span className="rb-toolbar__sep" />
      <form
        className="rb-toolbar__url"
        onSubmit={(event) => {
          event.preventDefault();
          if (canEditRoom && imageUrl.trim()) {
            void actions.createImageFromUrl(imageUrl);
            actions.setImageUrl("");
          }
        }}
      >
        <FileImage size={12} aria-hidden="true" />
        <input
          aria-label="Image URL"
          disabled={!canEditRoom}
          onChange={(event) => actions.setImageUrl(event.target.value)}
          placeholder="Paste image URL"
          value={imageUrl}
        />
        <button aria-label="Add image from URL" disabled={!canEditRoom} type="submit">
          Add
        </button>
      </form>
      <input
        ref={fileInputRef}
        accept="image/*"
        aria-hidden="true"
        className="file-upload-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void actions.createImageFromFile(file);
          }
          event.currentTarget.value = "";
        }}
        tabIndex={-1}
        type="file"
      />
      <button className="rb-tool" disabled={!canEditRoom} onClick={() => fileInputRef.current?.click()} type="button">
        <Upload size={14} aria-hidden="true" />
        <span>Upload</span>
      </button>
    </div>
  );
}
