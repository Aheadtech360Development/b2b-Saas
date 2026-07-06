"use client";

import { useState } from "react";
import Image from "next/image";
import { adminService } from "@/services/admin.service";
import type { ProductImage as ProductImageOut } from "@/types/product.types";

interface ImageManagerProps {
  productId: string;
  initialImages: ProductImageOut[];
  onUpdate: () => void;
}

export function ImageManager({ productId, initialImages, onUpdate }: ImageManagerProps) {
  const [images, setImages] = useState(initialImages);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await adminService.uploadImage(productId, file);
      onUpdate();
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  function handleDragStart(i: number) {
    setDragIndex(i);
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    setDragOverIndex(i);
  }

  async function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const reordered = [...images];
    const moved = reordered.splice(dragIndex, 1)[0];
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);
    setImages(reordered);
    setDragIndex(null);
    setDragOverIndex(null);
    await adminService.reorderImages(productId, reordered.map((i) => i.id));
    onUpdate();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        {images.map((img, i) => (
          <div
            key={img.id}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            className={`relative w-20 h-20 rounded border-2 overflow-hidden cursor-grab transition-all ${
              dragOverIndex === i ? "border-brand-500 scale-105" : "border-gray-200"
            } ${img.is_primary ? "ring-2 ring-brand-400" : ""}`}
          >
            <Image
              src={img.url_thumbnail_webp ?? img.url_thumbnail}
              alt={img.alt_text ?? "Product image"}
              fill
              sizes="80px"
              className="object-cover"
            />
            {img.is_primary && (
              <span className="absolute top-0.5 left-0.5 text-xs bg-brand-600 text-white px-1 rounded">
                Primary
              </span>
            )}
          </div>
        ))}

        {/* Upload button */}
        <label className="w-20 h-20 flex items-center justify-center rounded border-2 border-dashed border-gray-300 cursor-pointer hover:border-brand-400 transition-colors">
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleFileChange}
            disabled={isUploading}
          />
          {isUploading ? (
            <span className="text-xs text-gray-400">Uploading…</span>
          ) : (
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
        </label>
      </div>
      <p className="text-xs text-gray-400">Drag to reorder. Primary image is shown first.</p>
    </div>
  );
}
