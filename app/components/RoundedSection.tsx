const STYLE = {
    borderRadius: "5px",
    backgroundColor: "#fff",
    padding: "10px",
    marginBottom: "10px",
};

export default function RoundedSection({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-section" style={STYLE}>
            {children}
        </section>
    );
}
