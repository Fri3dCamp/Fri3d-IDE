/** Fri3d mark, extracted from the official favicon artwork. Plain, static. */
export function Fri3dLogo({ size = 72, className = '' }: { size?: number; className?: string }) {
    return (
        <svg
            viewBox="20 25 220 220"
            width={size}
            height={size}
            className={className}
            aria-hidden
        >
            <path
                fill="currentColor"
                className="text-black dark:text-white"
                d="m 38.519585,125.87852 84.410005,84.4 -45.920005,-91.87 4.54,-1.87 48.310005,96.62 48.29,-96.6 4.54,1.88 -45.9,91.81 84.4,-84.4 -91.33,-37.579999 z m 91.340005,-42.909999 88.89,-36.56 -26.9,53.779999 -4.54,-1.869999 21.2,-42.4 -72.22,29.7 93.57,38.519999 -100,100 v 0 l -100.000005,-100 93.530005,-38.519999 -72.190005,-29.74 21.19,42.34 -4.55,1.869999 -26.87,-53.679999 z"
            />
        </svg>
    )
}
