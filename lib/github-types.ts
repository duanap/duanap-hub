export type GithubSettings={title:string;description:string;repositories:string[]}
export const DEFAULT_GITHUB_SETTINGS:GithubSettings={title:'GitHub 动态',description:'公开代码仓库的近期更新与版本标签。',repositories:['duanap/duanap-hub']}
export type GithubRepository={name:string;url:string;description:string;stars:number;forks:number;pushedAt:string;tags:string[];release:null|{tag:string;url:string;publishedAt:string}}
export type GithubSnapshot={repositories:GithubRepository[];syncedAt:string;attemptedAt:string;error:string;status:'unconfigured'|'empty'|'ready'|'stale'|'error'}
