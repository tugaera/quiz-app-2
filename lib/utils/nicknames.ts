import {
  uniqueNamesGenerator,
  adjectives,
  animals,
} from "unique-names-generator";

export function randomPlayerNickname(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: " ",
    length: 2,
    style: "capital",
  });
}
