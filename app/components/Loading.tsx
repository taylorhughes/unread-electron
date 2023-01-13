export default function Loading({ text }: { text?: string }) {
    return (
        <span className="flex justify-center items-center">
            <span className="loading-ring" />
            {text?.length ?? 0 > 0 ? (
                <span className="loading-text ml-2">{text}</span>
            ) : null}
        </span>
    );
}
