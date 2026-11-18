// Runs a job after the next frame has painted. A frame callback would run before that frame's
// style resolve, and a message posted from inside one is handled only once the frame's rendering
// is done, so the job finds style clean and the transitions that resolve started.
let jobs: (() => void)[] | undefined;
let channel: MessageChannel | undefined;
let armed = false;

export const afterPaint = (job: () => void): void => {
  if (!channel) {
    const queue: (() => void)[] = [];
    jobs = queue;
    channel = new MessageChannel();
    channel.port1.onmessage = () => {
      for (const next of queue.splice(0)) next();
    };
  }
  jobs!.push(job);
  if (armed) return;
  armed = true;
  const port = channel.port2;
  requestAnimationFrame(() => {
    armed = false;
    port.postMessage(null);
  });
};
