export default function Loading() {
  return (
    <div className="section" aria-busy="true">
      <div className="container stack" style={{ ["--gap" as string]: "24px" }}>
        <div className="skeleton" style={{ height: 44, width: "40%" }} />
        <div className="skeleton" style={{ height: 120 }} />
        <div className="grid-cards">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card">
              <div className="skeleton" style={{ aspectRatio: "4 / 3", borderRadius: 0 }} />
              <div className="card-pad stack" style={{ ["--gap" as string]: "10px" }}>
                <div className="skeleton" style={{ height: 24, width: "50%" }} />
                <div className="skeleton" style={{ height: 18, width: "70%" }} />
                <div className="skeleton" style={{ height: 56 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
