export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[1.25rem] border border-[#e4dac9] bg-white/88 shadow-[0_18px_42px_rgba(16,34,61,0.07)] backdrop-blur-xl">
      {children}
    </div>
  );
}
