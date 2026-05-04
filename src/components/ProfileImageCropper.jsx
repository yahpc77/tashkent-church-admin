import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X, UploadCloud, Check } from 'lucide-react';

export default function ProfileImageCropper({ onImageCropped, initialImage }) {
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const imageDataUrl = await readFile(file);
      setImageSrc(imageDataUrl);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const imageDataUrl = await readFile(file);
      setImageSrc(imageDataUrl);
    }
  };

  const readFile = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(reader.result), false);
      reader.readAsDataURL(file);
    });
  };

  const createCroppedImage = async () => {
    try {
      const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      const file = new File([croppedImageBlob], 'profile.jpg', { type: 'image/jpeg' });
      onImageCropped(file, URL.createObjectURL(file));
      setImageSrc(null); // Close cropper
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="w-full">
      {!imageSrc && (
        <div
          className="relative border-2 border-dashed border-gray-600 rounded-xl hover:border-indigo-500 transition-colors bg-[#1a1a2e] flex flex-col items-center justify-center p-6 cursor-pointer"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          {initialImage ? (
            <div className="flex flex-col items-center">
              <img src={initialImage} alt="Profile" className="w-24 h-24 rounded-full object-cover mb-2 border-2 border-indigo-500" />
              <span className="text-sm text-gray-300">클릭하거나 사진을 드래그하여 변경</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <UploadCloud className="text-gray-400 mb-2" size={28} />
              <span className="text-sm text-gray-300">클릭하거나 프로필 사진을 드래그하여 업로드</span>
            </div>
          )}
        </div>
      )}

      {imageSrc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#1e1e2e] rounded-xl overflow-hidden w-full max-w-md flex flex-col h-[500px]">
            <div className="flex justify-between items-center p-4 border-b border-white/10">
              <h3 className="text-white font-medium">프로필 사진 자르기</h3>
              <button type="button" onClick={() => setImageSrc(null)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <div className="relative flex-1 bg-black">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={3 / 4} // 3:4 aspect ratio recommended
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            
            <div className="p-4 border-t border-white/10 flex justify-end gap-2 bg-[#1e1e2e]">
              <button
                type="button"
                onClick={() => setImageSrc(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={createCroppedImage}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
              >
                <Check size={16} /> 적용하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Utility to crop image
const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

async function getCroppedImg(imageSrc, pixelCrop) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((file) => {
      resolve(file);
    }, 'image/jpeg');
  });
}
