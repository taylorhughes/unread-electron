export default function RoundedSection({
    children,
    backgroundClass,
}: {
    children: React.ReactNode;
    backgroundClass?: string;
}) {
    return (
        <section
            className={`rounded-lg m-5 p-3 ${
                backgroundClass?.length ?? 0 > 0
                    ? backgroundClass
                    : "bg-slate-50"
            }`}
        >
            {children}
        </section>
    );
}
