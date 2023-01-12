export default function Loading({ text }: { text?: string }) {
    return (
        <span className="loading">
            <span className="loading-ring">
                <span />
            </span>
            {text?.length ?? 0 > 0 ? (
                <span className="loading-text">{text}</span>
            ) : null}
        </span>
    );
}
