import { runRepositoryContract } from '../repositories.contract';
import { createMemoryRepositories } from './memoryRepositories';

runRepositoryContract('memoria', async () => createMemoryRepositories());
