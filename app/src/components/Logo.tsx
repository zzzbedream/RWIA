export function Logo({className = "w-6 h-6"}: {className?: string}) {
    return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden>
            <defs>
                <linearGradient id="rw" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0" stopColor="#60a5fa" />
                    <stop offset="1" stopColor="#7c3aed" />
                </linearGradient>
            </defs>
            <path
                d="M16 2L4 8v12l12 10 12-10V8z"
                stroke="url(#rw)"
                strokeWidth="1.5"
                fill="rgba(99,102,241,0.10)"
            />
            <path d="M16 8L9 12v8l7 6 7-6v-8z" fill="url(#rw)" opacity="0.7" />
        </svg>
    );
}

export function Brand({className = ""}: {className?: string}) {
    return (
        <div className={`flex items-center gap-2 text-white font-semibold tracking-tight ${className}`}>
            <Logo className="w-7 h-7" />
            <span className="text-lg">
                Waypoint <span className="text-white/40 font-normal">/ RWIA</span>
            </span>
        </div>
    );
}
