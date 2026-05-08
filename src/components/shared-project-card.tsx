import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { SharedProject } from "@/lib/shared-projects/types";

const POSTER_BASE = "https://image.tmdb.org/t/p/w185";
const PROFILE_BASE = "https://image.tmdb.org/t/p/w92";

type Props = {
  project: SharedProject;
  resolvedActors: Map<number, { name: string; profilePath: string | null }>;
};

export function SharedProjectCard({ project, resolvedActors }: Props) {
  return (
    <Card>
      <CardContent className="flex gap-4 p-4">
        <div className="shrink-0">
          {project.posterPath ? (
            <Image
              src={`${POSTER_BASE}${project.posterPath}`}
              alt={`${project.title}${project.year ? ` (${project.year})` : ""}`}
              width={92}
              height={138}
              className="rounded-md"
            />
          ) : (
            <div className="flex h-[138px] w-[92px] items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
              {initials(project.title)}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold truncate">{project.title}</h3>
            {project.year !== null ? (
              <span className="text-sm text-muted-foreground">{project.year}</span>
            ) : null}
            <Badge variant="secondary">
              {project.mediaType === "movie" ? "Movie" : "TV"}
            </Badge>
          </div>
          {project.overview ? (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {project.overview}
            </p>
          ) : null}
          <ul className="flex flex-col gap-1 pt-1">
            {project.roles.map((role) => {
              const actor = resolvedActors.get(role.actorId);
              return (
                <li
                  key={role.actorId}
                  className="flex items-center gap-2 text-sm"
                >
                  <Avatar className="h-6 w-6">
                    {actor?.profilePath ? (
                      <AvatarImage
                        src={`${PROFILE_BASE}${actor.profilePath}`}
                        alt=""
                      />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {initials(role.actorName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{role.actorName}</span>
                  <span className="text-muted-foreground">
                    — {role.kind === "crew" ? `crew: ${role.role || "—"}` : role.role || "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
