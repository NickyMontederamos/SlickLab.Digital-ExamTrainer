"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card } from "@/components/ui";

type Phase = "requesting" | "denied" | "unsupported" | "device-check" | "capture" | "review";

/**
 * Real replacement for ExamEntryGate's old "device"/"identity"/"room" mocked
 * timers (docs reference: ExamSoft's ExamID + ExamMonitor pre-exam device
 * check and photo capture — support.examsoft.com/hc/en-us/articles/11146346837901).
 * Real research turned up a webcam/mic permission + live preview step
 * (Device Check) followed by a photo-capture-and-review step (ExamID) —
 * no separate "room scan" step in the real product (ExamMonitor's actual
 * room/environment monitoring is continuous recording during the exam
 * itself, not a pre-check), so that mocked step is dropped rather than
 * carried forward as a fake.
 *
 * Everything here is genuinely real: navigator.mediaDevices.getUserMedia
 * requests actual camera/mic permission, the video preview is the actual
 * live feed, the microphone meter reads actual mic input via the Web Audio
 * API, and the ExamID photo is an actual canvas snapshot from that feed.
 *
 * What's deliberately NOT built: server-side identity verification. Real
 * ExamID validates the photo against a baseline on ExamSoft's servers —
 * this trainer has no such baseline and no legitimate reason to store a
 * photo of a student's face, so the captured image never leaves this
 * component (not uploaded, not persisted) and is discarded once the gate
 * finishes. The photo step here only confirms the camera captures a usable
 * image, same honesty boundary as everywhere else "real vs. simulated" is
 * disclosed in this app.
 *
 * A denied/missing camera never hard-blocks a practice attempt — same soft
 * check posture as ExamEntryGate's fullscreen request. This is a readiness
 * trainer, not the exam-day enforcement software, so a webcam-less laptop
 * shouldn't stop someone from practicing.
 */
export function DeviceAndIdentityCheck({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<Phase>("requesting");
  const [micLevel, setMicLevel] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (cancelled) return;
        setErrorMessage(
          "This browser doesn't support camera access here (or this page isn't loaded securely). ExamID/ExamMonitor need a modern browser over HTTPS."
        );
        setPhase("unsupported");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();

        setPhase("device-check");
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        setErrorMessage(
          name === "NotAllowedError"
            ? "Camera/microphone access was blocked. Click the camera icon in your browser's address bar, allow access, then reload."
            : name === "NotFoundError"
              ? "No camera or microphone was found on this device."
              : "Couldn't access your camera or microphone."
        );
        setPhase("denied");
      }
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function stopMedia() {
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setPhoto(canvas.toDataURL("image/jpeg", 0.85));
    setPhase("review");
  }

  function retake() {
    setPhoto(null);
    setPhase("capture");
  }

  function finish() {
    stopMedia();
    onComplete();
  }

  if (phase === "requesting") {
    return (
      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand-primary dark:border-slate-800" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Requesting camera &amp; microphone access…</p>
      </Card>
    );
  }

  if (phase === "denied" || phase === "unsupported") {
    return (
      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Device Check</h2>
        <Alert tone="error">{errorMessage}</Alert>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          This is a practice trainer, not the exam-day software — a blocked or missing camera won&apos;t stop you from
          practicing. On exam day with real Examplify, this would need to be fixed before you could continue.
        </p>
        <Button type="button" variant="secondary" onClick={finish} className="self-start">
          Continue without ExamID/ExamMonitor
        </Button>
      </Card>
    );
  }

  if (phase === "device-check") {
    return (
      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Device Check</h2>
        <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg bg-slate-900" />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Say something to test your microphone
          </span>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${micLevel}%` }} />
          </div>
        </div>
        <Button type="button" onClick={() => setPhase("capture")} className="self-start">
          Continue
        </Button>
      </Card>
    );
  }

  if (phase === "capture") {
    return (
      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">ExamID</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Make sure your webcam is uncovered and you&apos;re facing the camera, then take your photo.
        </p>
        <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg bg-slate-900" />
        <Button type="button" onClick={capturePhoto} className="self-start">
          Take Photo
        </Button>
      </Card>
    );
  }

  // phase === "review"
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">ExamID</h2>
      {photo && <img src={photo} alt="Captured for ExamID" className="w-full rounded-lg" />}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        This photo isn&apos;t saved or uploaded anywhere — it only confirms your camera captures a clear image. Real
        ExamID verifies identity against a baseline photo on ExamSoft&apos;s servers, which this trainer doesn&apos;t
        do.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={retake}>
          Retake
        </Button>
        <Button type="button" onClick={finish}>
          Save and Continue
        </Button>
      </div>
    </Card>
  );
}
